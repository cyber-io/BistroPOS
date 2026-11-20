import { spawn } from 'node:child_process';
const shell=process.platform==='win32';
const services=spawn('node',['scripts/dev.mjs'],{stdio:'inherit',shell});
let electron;
const stop=()=>{services.kill('SIGTERM');electron?.kill('SIGTERM');};
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});
let connected=false;
for(let attempt=0;attempt<60;attempt++){
  try{const res=await fetch('http://127.0.0.1:5173');if(res.ok){connected=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
if(!connected){console.error('The frontend did not start. Check the output above.');stop();process.exit(1);}
electron=spawn('npm',['run','desktop'],{stdio:'inherit',shell,env:{...process.env,BISTRO_DEV_URL:'http://127.0.0.1:5173'}});
electron.on('exit',()=>{stop();process.exit(0);});
