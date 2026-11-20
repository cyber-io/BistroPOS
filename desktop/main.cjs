const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
let mainWindow, settingsWindow, server, origin, reconnecting=false;
app.setName('Bistro & Bloom POS');
const getSettingsPath = () => path.join(app.getPath('userData'), 'restaurant-server.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')); }
  catch { return { apiUrl: process.env.BISTRO_API_URL || 'http://127.0.0.1:5050' }; }
}
let settings;
function validateUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter a server origin, for example https://api.yourrestaurant.com');
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Use HTTPS for a remote restaurant server. Local servers can use HTTP.');
  return url.origin;
}
function sendFile(res, file) {
  const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json'};
  res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control': file.endsWith('.html')?'no-store':'public, max-age=3600'});
  fs.createReadStream(file).pipe(res);
}
function startServer() {
  const root = path.resolve(__dirname,'../frontend/dist');
  return new Promise((resolve,reject)=>{
    server = http.createServer((req,res)=>{
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/desktop-settings') return sendFile(res, path.join(__dirname,'settings.html'));
      if (url.pathname === '/desktop-settings.js') return sendFile(res, path.join(__dirname,'settings.js'));
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/hubs/')) {
        if(reconnecting){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({message:'Reconnecting to the restaurant server…'}));}
        let target;
        try { target = new URL(url.pathname+url.search, settings.apiUrl); } catch { res.writeHead(502,{'Content-Type':'application/json'});return res.end(JSON.stringify({message:'Configure your restaurant server in the application menu.'})); }
        const transport = target.protocol==='https:'?https:http;
        const headers = {...req.headers, host:target.host}; delete headers.origin; delete headers.referer;
        const proxy = transport.request(target,{method:req.method,headers,timeout:20000},remote=>{res.writeHead(remote.statusCode,remote.headers);remote.pipe(res);});
        proxy.on('timeout',()=>proxy.destroy(new Error('Server timeout')));
        proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Cannot connect to the restaurant server. Open Bistro & Bloom POS → Restaurant server to check the address.'}));});
        req.pipe(proxy);return;
      }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400);res.end();return; }
      const file=path.resolve(root, `.${pathname}`);
      if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      if(fs.existsSync(file)&&fs.statSync(file).isFile())return sendFile(res,file);
      if(path.extname(pathname)){res.writeHead(404);res.end();return;}
      return sendFile(res,path.join(root,'index.html'));
    });
    server.on('error',error=>{if(error.code==='EADDRINUSE'&&settings.localPort){settings.localPort=0;server.listen(0,'127.0.0.1');}else reject(error);});
    server.on('listening',()=>{settings.localPort=server.address().port;fs.writeFileSync(getSettingsPath(),JSON.stringify(settings,null,2),{mode:0o600});origin=`http://127.0.0.1:${settings.localPort}`;resolve();});
    server.listen(settings.localPort||0,'127.0.0.1');
  });
}
function secureWindow(win) {
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/')){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
}
function openSettings() {
  if(settingsWindow){settingsWindow.focus();return;}
  settingsWindow=new BrowserWindow({width:540,height:480,resizable:false,parent:mainWindow,modal:true,title:'Restaurant server',backgroundColor:'#f7f8fb',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  secureWindow(settingsWindow);settingsWindow.loadURL(`${origin}/desktop-settings`);settingsWindow.on('closed',()=>{settingsWindow=null;});
}
function createWindow() {
  mainWindow = new BrowserWindow({width:1440,height:960,minWidth:850,minHeight:620,title:'Bistro & Bloom POS',backgroundColor:'#f7f8fb',show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false}});
  secureWindow(mainWindow);
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  const dev=process.env.BISTRO_DEV_URL;
  if(dev){mainWindow.webContents.removeAllListeners('will-navigate');mainWindow.loadURL(dev+'/pos');}
  else mainWindow.loadURL(`${origin}/pos`);
  mainWindow.on('closed',()=>{mainWindow=null;});
  const menu=[
    ...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{label:'Restaurant server…',click:openSettings},{type:'separator'},{role:'hide'},{role:'hideOthers'},{type:'separator'},{role:'quit'}]}]:[{label:'File',submenu:[{label:'Restaurant server…',click:openSettings},{type:'separator'},{role:'quit'}]}]),
    {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'reload'},{role:'forceReload'},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'},...(app.isPackaged?[]:[{role:'toggleDevTools'}])]},
    {label:'Window',submenu:[{role:'minimize'},{role:'close'}]},
    {label:'Help',submenu:[{label:'Restaurant server…',click:openSettings},{label:'About this application',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'Bistro & Bloom POS',message:'Bistro & Bloom POS',detail:`Version ${app.getVersion()}\nConnected restaurant operations for front desk, kitchen and floor service.\n\nDesktop app requires the shared .NET restaurant API and PostgreSQL database. Configure the API address under Restaurant server.`})}]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}
const hasLock=app.requestSingleInstanceLock();
if(!hasLock)app.quit();
else {
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
  app.whenReady().then(async()=>{
    settings=readSettings();
    ipcMain.handle('restaurant:get-settings',event=>{if(event.sender!==settingsWindow?.webContents)throw new Error('Unauthorized');return {apiUrl:settings.apiUrl};});
    ipcMain.handle('restaurant:save-settings',async(event,value)=>{if(event.sender!==settingsWindow?.webContents)throw new Error('Unauthorized');const apiUrl=validateUrl(value);reconnecting=true;try{mainWindow?.webContents.stop();await mainWindow?.webContents.executeJavaScript('sessionStorage.clear()');await mainWindow?.webContents.session.clearStorageData({storages:['localstorage']});settings={...settings,apiUrl};fs.writeFileSync(getSettingsPath(),JSON.stringify(settings,null,2),{mode:0o600});}finally{reconnecting=false;}await mainWindow?.loadURL(`${origin}/login`);return {success:true};});
    ipcMain.handle('restaurant:test-server',async(event,value)=>{if(event.sender!==settingsWindow?.webContents)throw new Error('Unauthorized');const apiUrl=validateUrl(value);const response=await fetch(`${apiUrl}/api/health`,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Server health check failed. Check the API address.');const result=await response.json();if(result.status!=='ok')throw new Error('Restaurant API is not ready.');return {success:true};});
    await startServer();createWindow();
    app.on('activate',()=>{if(!mainWindow)createWindow();});
  }).catch(error=>{dialog.showErrorBox('Unable to open POS',error.message);app.quit();});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
  app.on('before-quit',()=>server?.close());
}
