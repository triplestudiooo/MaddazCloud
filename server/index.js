require('dotenv').config()
const express = require('express')
const Busboy = require('busboy')
const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const FormData = require('form-data')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const cors = require('cors')

const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN
const STORAGE_CHAT = process.env.TELEGRAM_CHAT_ID
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret'

if(!TELEGRAM_BOT || !STORAGE_CHAT){
  console.warn('Warning: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID should be set in .env')
}

// We'll stream uploads with Busboy to avoid storing large files in memory

const app = express()
app.use(cors())
app.use(express.json())

const DB_DIR = path.join(__dirname)
const USERS_FILE = path.join(DB_DIR,'users.json')
const META_FILE = path.join(DB_DIR,'metadata.json')

function loadJSON(p, def){ try{ return JSON.parse(fs.readFileSync(p,'utf8')) }catch(e){ return def } }
function saveJSON(p, data){ fs.writeFileSync(p, JSON.stringify(data,null,2)) }

let users = loadJSON(USERS_FILE, {users:[]})
let meta = loadJSON(META_FILE, {files:[]})

function authMiddleware(req,res,next){ const h = req.headers.authorization; if(!h) return res.status(401).send('Unauthorized'); const parts = h.split(' '); if(parts[0] !== 'Bearer') return res.status(401).send('Unauthorized'); try{ const payload = jwt.verify(parts[1], JWT_SECRET); req.user = payload; next() }catch(e){ return res.status(401).send('Invalid token') } }

app.post('/api/auth/register', async (req,res)=>{
  const {email,password,name} = req.body
  if(!email || !password) return res.status(400).send('Missing')
  if(users.users.find(u=>u.email===email)) return res.status(400).send('Exists')
  const hash = await bcrypt.hash(password, 10)
  const u = {id: Date.now().toString(), email, name: name||'', password:hash, admin:false}
  users.users.push(u); saveJSON(USERS_FILE, users)
  res.json({ok:true})
})

app.post('/api/auth/login', async (req,res)=>{
  const {email,password} = req.body
  const u = users.users.find(x=>x.email===email)
  if(!u) return res.status(401).send('No user')
  const ok = await bcrypt.compare(password, u.password)
  if(!ok) return res.status(401).send('Bad creds')
  const token = jwt.sign({id:u.id,email:u.email,admin:!!u.admin}, JWT_SECRET, {expiresIn:'7d'})
  res.json({token})
})

// (No external OAuth) using local registration + email login

app.post('/api/upload', authMiddleware, (req,res)=>{
  // stream multipart data parts and forward each file stream to Telegram
  const bb = new Busboy({headers: req.headers, limits: {fileSize: 2 * 1024 * 1024 * 1024}})
  const results = []
  let pending = 0
  let hadFile = false

  bb.on('file', (fieldname, file, filename, encoding, mimetype) => {
    hadFile = true
    pending++
    const form = new FormData()
    form.append('chat_id', STORAGE_CHAT || '')
    // append the incoming stream directly
    form.append('document', file, {filename})
    form.append('caption', JSON.stringify({owner: req.user.id, name: filename, uploadedAt: Date.now()}))

    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT}/sendDocument`, {method: 'POST', body: form})
      .then(r => r.json())
      .then(jr => {
        if(!jr || !jr.ok){ console.error('tg error', jr); }
        else{
          const fileInfo = {id: jr.result.document.file_id, tg_file_id: jr.result.document.file_id, tg_file_unique_id: jr.result.document.file_unique_id, name: filename, size: jr.result.document.file_size || null, owner: req.user.id, message_id: jr.result.message_id, uploadedAt: Date.now()}
          meta.files.push(fileInfo)
          results.push(fileInfo)
        }
      })
      .catch(err => { console.error('upload error', err) })
      .finally(()=>{
        pending--
        if(pending === 0){ saveJSON(META_FILE, meta); res.json({files: results}) }
      })
  })

  bb.on('finish', ()=>{
    if(!hadFile) return res.status(400).send('No files')
    if(pending === 0){ saveJSON(META_FILE, meta); res.json({files: results}) }
    // otherwise response is sent when pending reaches 0
  })

  req.pipe(bb)
})

app.get('/api/files', authMiddleware, (req,res)=>{
  const files = meta.files.filter(f=>f.owner === req.user.id)
  res.json({files})
})

app.post('/api/rename', authMiddleware, (req,res)=>{
  const {id,name} = req.body
  const f = meta.files.find(x=>x.id===id && x.owner===req.user.id)
  if(!f) return res.status(404).send('Not found')
  f.name = name
  saveJSON(META_FILE, meta)
  res.json({ok:true})
})

app.get('/api/download/:id', authMiddleware, async (req,res)=>{
  const id = req.params.id
  const f = meta.files.find(x=>x.id===id && x.owner===req.user.id)
  if(!f) return res.status(404).send('Not found')
  // get file path
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT}/getFile?file_id=${encodeURIComponent(f.tg_file_id)}`)
  const jr = await r.json()
  if(!jr.ok) return res.status(502).send('Telegram error')
  const file_path = jr.result.file_path
  const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT}/${file_path}`
  res.redirect(url)
})

app.get('/api/raw/:id', authMiddleware, async (req,res)=>{
  const id = req.params.id
  const f = meta.files.find(x=>x.id===id && x.owner===req.user.id)
  if(!f) return res.status(404).send('Not found')
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT}/getFile?file_id=${encodeURIComponent(f.tg_file_id)}`)
  const jr = await r.json()
  if(!jr.ok) return res.status(502).send('Telegram error')
  const file_path = jr.result.file_path
  const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT}/${file_path}`
  // for raw preview, redirect to URL which serves the content with proper mime
  res.redirect(url)
})

// Admin: list users
app.get('/api/admin/users', authMiddleware, (req,res)=>{
  if(!req.user.admin) return res.status(403).send('Forbidden')
  res.json({users: users.users})
})

const PORT = process.env.PORT || 3000
app.use('/', express.static(path.join(__dirname,'../web')))
app.listen(PORT, ()=> console.log('Server listening on', PORT))
