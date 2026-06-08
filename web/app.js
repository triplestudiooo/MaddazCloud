const API = (window.location.hostname === 'localhost') ? 'http://localhost:3000/api' : '/api'
let token = null
// token persists only in-memory for this prototype
const fileListEl = document.getElementById('fileList')
const emptyEl = document.getElementById('empty')
const fileInput = document.getElementById('fileInput')
const uploadBtn = document.getElementById('uploadBtn')
const previewArea = document.getElementById('previewArea')
const loginBtn = document.getElementById('loginBtn')
const loginModal = document.getElementById('loginModal')
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));b.classList.add('active');const v=b.dataset.view;document.getElementById('filesView').classList.toggle('hidden', v!=='files');document.getElementById('settingsView').classList.toggle('hidden', v!=='settings')}))

fileInput.addEventListener('change', ()=>{
  previewArea.innerHTML = ''
  Array.from(fileInput.files).forEach((f, idx)=>{
    const card = document.createElement('div'); card.className='preview-card';
    const thumb = document.createElement('div'); thumb.className='preview-thumb'
    const name = document.createElement('div'); name.className='preview-name'; name.textContent = f.name
    const prog = document.createElement('div'); prog.className='progress'; prog.innerHTML = '<i></i>'
    card.appendChild(thumb); card.appendChild(name); card.appendChild(prog)
    previewArea.appendChild(card)
    // preview images/audio/video
    if(f.type.startsWith('image/')){
      const img = document.createElement('img'); img.className='preview-thumb'; img.src = URL.createObjectURL(f); card.replaceChild(img, thumb)
    } else if(f.type.startsWith('video/')){
      const v = document.createElement('video'); v.className='preview-thumb'; v.src = URL.createObjectURL(f); v.muted=true; v.playsInline=true; card.replaceChild(v, thumb)
    } else if(f.type.startsWith('audio/')){
      const a = document.createElement('div'); a.className='preview-thumb'; a.textContent='Audio'; card.replaceChild(a, thumb)
    }
  })
})

uploadBtn.addEventListener('click', async ()=>{
  const files = Array.from(fileInput.files)
  if(!files.length) return alert('Pilih file terlebih dahulu')
  // upload files one-by-one to show per-file progress
  for(let i=0;i<files.length;i++){
    const f = files[i]
    const card = previewArea.children[i]
    const bar = card.querySelector('.progress > i')
    await uploadFileXHR(f, bar)
  }
  fileInput.value=''
  previewArea.innerHTML=''
  await loadFiles()
  alert('Upload selesai')
})

function uploadFileXHR(file, progressIndicator){
  return new Promise((resolve,reject)=>{
    const xhr = new XMLHttpRequest()
    xhr.open('POST', API + '/upload')
    if(token) xhr.setRequestHeader('Authorization', 'Bearer '+token)
    xhr.upload.onprogress = (e)=>{
      if(e.lengthComputable){ const p = Math.round((e.loaded / e.total) * 100); progressIndicator.style.width = p + '%' }
    }
    xhr.onload = ()=>{ if(xhr.status>=200 && xhr.status<300) resolve(xhr.response); else reject(xhr.response) }
    xhr.onerror = ()=> reject(new Error('Network error'))
    const fd = new FormData(); fd.append('file', file, file.name)
    xhr.send(fd)
  })
}

loginBtn.addEventListener('click', ()=>{loginModal.classList.toggle('hidden')})
document.getElementById('closeLogin').addEventListener('click', ()=>loginModal.classList.add('hidden'))
document.getElementById('emailLogin').addEventListener('click', async ()=>{
  const email=document.getElementById('email').value
  const pass=document.getElementById('password').value
  const res = await fetch(API + '/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email, password:pass})})
  if(res.ok){ const j=await res.json(); token=j.token; loginModal.classList.add('hidden'); loadFiles(); alert('Login berhasil') } else { alert('Login gagal') }
})
document.getElementById('registerBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('name').value
  const email = document.getElementById('email').value
  const pass = document.getElementById('password').value
  if(!email || !pass) return alert('Email dan password wajib')
  const res = await fetch(API + '/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password: pass, name})})
  if(res.ok){
    // auto-login after register
    const r2 = await fetch(API + '/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password: pass})})
    if(r2.ok){ const j=await r2.json(); token=j.token; loginModal.classList.add('hidden'); loadFiles(); alert('Register & login berhasil') }
    else { alert('Register berhasil, tapi login otomatis gagal') }
  } else {
    const t = await res.text(); alert('Register gagal: '+t)
  }
})

async function loadFiles(){
  const res = await fetch(API + '/files', {headers: token?{Authorization:'Bearer '+token}:{}})
  if(!res.ok) return
  const j = await res.json()
  fileListEl.innerHTML=''
  if(!j.files.length){ emptyEl.style.display='block'; return }
  emptyEl.style.display='none'
  for(const f of j.files){
    const li = document.createElement('li'); li.className='file-item'
    li.innerHTML = `<div class="file-meta"><div><div class="file-name">${escapeHtml(f.name)}</div><div class="file-size">${formatBytes(f.size)}</div></div><div class="file-actions"><button data-id="${f.id}" class="btn small" data-action="raw">Raw</button><button data-id="${f.id}" class="btn small" data-action="download">Download</button><button data-id="${f.id}" class="btn small" data-action="rename">Rename</button></div></div>`
    fileListEl.appendChild(li)
  }
  fileListEl.querySelectorAll('button[data-action]').forEach(b=>b.addEventListener('click', async ev=>{
    const id = ev.target.dataset.id; const action = ev.target.dataset.action
    if(action==='download'){ window.open(API + '/download/'+id+'?token='+token) }
    if(action==='raw'){ window.open(API + '/raw/'+id+'?token='+token) }
    if(action==='rename'){ const n=prompt('Nama baru'); if(!n) return; await fetch(API + '/rename', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({id, name:n})}); loadFiles() }
  }))
}

function formatBytes(bytes){ if(bytes===0) return '0 B'; const k=1024; const dm=2; const sizes=['B','KB','MB','GB','TB']; const i=Math.floor(Math.log(bytes)/Math.log(k)); return parseFloat((bytes/Math.pow(k,i)).toFixed(dm))+' '+sizes[i] }
function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]) }

// initial
loadFiles()
