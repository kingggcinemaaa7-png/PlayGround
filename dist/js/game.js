import * as THREE from 'three';

const host=document.getElementById('game');
const renderer=new THREE.WebGLRenderer({antialler:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x100b08);scene.fog=new THREE.FogExp2(0x100b08,.018);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,500);
const clock=new THREE.Clock();const players=new Map();const particles=[];

const gold=new THREE.MeshStandardMaterial({color:0xd6a84b,metalness:.75,roughness:.28});
const red=new THREE.MeshStandardMaterial({color:0x7d1d18,roughness:.7});
const steel=new THREE.MeshStandardMaterial({color:0x9ca0a0,metalness:.85,roughness:.22});
const stone=new THREE.MeshStandardMaterial({color:0x77705f,roughness:.9});

scene.add(new THREE.HemisphereLight(0xffddaa,0x24150e,2));const sun=new THREE.DirectionalLight(0xffcf83,3);sun.position.set(-20,35,20);sun.castShadow=true;scene.add(sun);

const road=new THREE.Group();for(let z=-90;z<90;z+=4){const slab=new THREE.Mesh(new THREE.BoxGeometry(12,.35,3.7),stone);slab.position.set(0,-.18,z);slab.receiveShadow=true;road.add(slab)}
for(const side of [-1,1]){for(let z=-84;z<85;z+=16){const c=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,4,8),new THREE.MeshStandardMaterial({color:0x3e2417,roughness:.8}));c.position.set(side*8,1.4,z);c.castShadow=true;road.add(c);const flame=new THREE.Mesh(new THREE.ConeGeometry(.35,.9,8),new THREE.MeshBasicMaterial({color:0xff7616}));flame.position.set(side*8,3.2,z);road.add(flame)}}
for(let i=-3;i<=3;i++){const gate=new THREE.Mesh(new THREE.TorusGeometry(3.4,.28,8,24,Math.PI),gold);gate.position.set(i*13,3,-38);gate.rotation.z=Math.PI;gate.castShadow=true;road.add(gate)}
for(let i=-2;i<=2;i++){const dome=new THREE.Mesh(new THREE.SphereGeometry(2,12,8,0,Math.PI*2,0,Math.PI/2),red);dome.scale.y=.65;dome.position.set(i*8,4,-92);road.add(dome)}scene.add(road);

const throne=new THREE.Group();for(const x of [-2.4,2.4]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.35,3,.35),gold);leg.position.set(x,1.5,0);throne.add(leg)}const seat=new THREE.Mesh(new THREE.BoxGeometry(5.2,.7,3),red);seat.position.y=3.2;seat.castShadow=true;throne.add(seat);const back=new THREE.Mesh(new THREE.BoxGeometry(5.2,5,.45),gold);back.position.set(0,5.5,-1.2);throne.add(back);throne.position.set(0,0,-104);scene.add(throne);

function makeSoldier(index){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,1.15,4,8),red);body.position.y=1.2;body.castShadow=true;g.add(body);const helm=new THREE.Mesh(new THREE.SphereGeometry(.42,10,8),steel);helm.position.y=2.25;helm.castShadow=true;g.add(helm);const plume=new THREE.Mesh(new THREE.ConeGeometry(.12,.8,6),gold);plume.position.set(0,2.85,.12);plume.rotation.x=.15;g.add(plume);const armGeo=new THREE.CylinderGeometry(.1,.11,.95,6);for(const x of [-.48,.48]){const arm=new THREE.Mesh(armGeo,red);arm.position.set(x,1.35,0);arm.rotation.z=x>0?-1.05:1.05;g.add(arm)}const spear=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,3.1,5),gold);spear.position.set(.65,1.45,-.15);g.add(spear);const avatarFrame=new THREE.Mesh(new THREE.CircleGeometry(.46,16),new THREE.MeshStandardMaterial({color:0xf1db8a,emissive:0x241400,side:THREE.DoubleSide}));avatarFrame.position.set(0,2.45,.39);avatarFrame.name='AvatarFrame';g.add(avatarFrame);g.userData.phase=Math.random()*6;g.userData.walk=1.4+Math.random()*.25;return g}

const catapults=[];for(const side of [-1,1]){const c=new THREE.Group();const wood=new THREE.MeshStandardMaterial({color:0x5b3821,roughness:.75});const base=new THREE.Mesh(new THREE.BoxGeometry(2.4,.25,2),wood);base.position.y=.15;c.add(base);const arm=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,3),wood);arm.position.set(0,1.1,.3);arm.rotation.x=-.35;c.add(arm);c.position.set(side*9,0,-15);c.userData.side=side;scene.add(c);catapults.push(c)}

function rankColor(rank){return rank==='Vezir'?0xffd47a:rank==='Sancaktar'?0xc9c7c2:rank==='Sipahi'?0x4aa0a2:0x7d1d18}

function createPlayer(ev,index){const id=ev.uniqueId||`misafir-${index}`;if(players.has(id))return players.get(id);const g=makeSoldier(index);g.userData={id,nickname:ev.nickname||id,rank:'Nefer',score:0,avatar:'',target:new THREE.Vector3(),phase:g.userData.phase};scene.add(g);players.set(id,g);if(players.size>150){const oldest=players.keys().next().value;const old=players.get(oldest);scene.remove(old);players.delete(oldest)}applyAvatar(g,ev.profilePictureUrl);reorder();return g}

async function applyAvatar(g,url){if(!url)return;try{const tx=new THREE.TextureLoader().load(`/api/avatar?url=${encodeURIComponent(url)}`,t=>{t.colorSpace=THREE.SRGBColorSpace;const frame=g.getObjectByName('AvatarFrame');if(frame)frame.material=new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide})})}catch(e){}}

function reorder(){const arr=[...players.values()].sort((a,b)=>(b.userData.score||0)-(a.userData.score||0));arr.forEach((g,i)=>{const rankIndex=g.userData.rank==='Vezir'?0:g.userData.rank==='Sancaktar'?1:g.userData.rank==='Sipahi'?2:3;const lane=(i%7)-3;const row=Math.floor(i/7);g.userData.target.set(lane*1.45,0,rankIndex*-6-row*.9+22)});}

for(let i=0;i<24;i++){const g=makeSoldier(i);g.userData={id:'demo-'+i,nickname:'Nefer '+i,rank:i<3?'Sancaktar':i<8?'Sipahi':'Nefer',score:150-i*4,target:new THREE.Vector3()};scene.add(g);players.set(g.userData.id,g)}reorder();

function setBanner(text){const b=document.getElementById('banner');b.textContent=text;b.classList.add('show');clearTimeout(setBanner.t);setBanner.t=setTimeout(()=>b.classList.remove('show'),4200)}

let cameraMode='court';let cameraUntil=0;let shake=0;const defaultPos=()=>new THREE.Vector3(21,19,42);
function action(ev){if(ev.type==='like'||ev.type==='chat'&&ev.label?.toLowerCase().includes('katil'))return joinMarch(ev);if(ev.type==='member')return joinMarch(ev);if(!ev.action&&!ev.giftName)return;return processAction(ev.action||resolveGift(ev),ev)}
function resolveGift(ev){const diamond=ev.coins||ev.diamond||0;if(diamond>=500)return'RANK_VIZIER';if(diamond>=300)return'EVENT_SEAL';if(diamond>=100)return'RANK_CAVALRY';if(diamond>=50)return'EVENT_CATAPULT';if(diamond>=30)return'EVENT_MEHTER';if(diamond>=10)return'RANK_SANCAKTAR';if(diamond>0)return'RANK_SIPAHI';return'JOIN_MARCH'}
function joinMarch(ev){const g=createPlayer(ev,players.size);g.userData.score=(g.userData.score||0)+1;g.userData.rank='Nefer';reorder();setBanner(`${g.userData.nickname} safa katıldı!`)}
function processAction(actionId,ev){const g=createPlayer(ev,players.size);if(actionId==='RANK_SIPAHI'){g.userData.rank='Sipahi';g.userData.score+=10}if(actionId==='RANK_SANCAKTAR'){g.userData.rank='Sancaktar';g.userData.score+=25;cinematic(g,3000)}if(actionId==='RANK_CAVALRY'){g.userData.rank='Atlı';g.userData.score+=100;window.fetihSound.playHorseNeigh();cinematic(g,3000)}if(actionId==='EVENT_MEHTER'){window.fetihSound.playMehterDrum();cameraMode='mehter';cameraUntil=clock.elapsedTime+8;setBanner('MEHTER TAKIMI COŞKUSU');}if(actionId==='EVENT_CATAPULT'){window.fetihSound.playCatapultFire();shake=.8;cameraMode='catapult';cameraUntil=clock.elapsedTime+4;setBanner('MANÇINIK SALDIRISI · +100 PUAN');g.userData.score+=100}if(actionId==='EVENT_SEAL'){window.fetihSound.playGrandSeal();shake=.9;cinematic(g,4000);setBanner(`${g.userData.nickname} · 60 SANİYE DOKUNULMAZLIK`)}if(actionId==='RANK_VIZIER'){g.userData.rank='Vezir';g.userData.score+=500;window.fetihSound.playVizierFanfare();cinematic(g,5000);setBanner(`FERMAN: ${g.userData.nickname.toUpperCase()} BAŞKOMUTAN OLDU`)}reorder()}
function cinematic(g,duration){cameraMode='subject';g.userData.cameraUntil=clock.elapsedTime+duration/1000}

const socket=io();socket.on('live:event',ev=>{action(ev);});socket.on('game:settings',s=>{document.getElementById('safe').classList.toggle('on',!!s.safe);document.body.classList.toggle('portrait',s.mode==='portrait');if(s.volume!=null)window.fetihSound.setVolume(s.volume/100);if(s.muted!=null)window.fetihSound.setMuted(s.muted)});
socket.on('leaderboard:update',b=>{(b?.players||[]).forEach(p=>{const g=players.get(p.uniqueId);if(g){g.userData.score=p.score||g.userData.score;g.userData.rank=p.rank||g.userData.rank}});reorder()});

function setAspect(mode){const portrait=mode==='portrait'||(mode==null&&innerHeight>innerWidth);document.body.classList.toggle('portrait',portrait);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.fov=portrait?53:38;camera.updateProjectionMatrix()}
let mode=localStorage.getItem('aspect')||'landscape';setAspect(mode);
window.addEventListener('keydown',e=>{if(e.key==='F9'){mode=mode==='portrait'?'landscape':'portrait';localStorage.setItem('aspect',mode);setAspect(mode);socket.emit('game:settings',{mode,safe:document.getElementById('safe').classList.contains('on')})}});
window.addEventListener('resize',()=>setAspect(mode));

let simTimer=setInterval(()=>{},1e9);

function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);const elapsed=clock.elapsedTime;for(const g of players.values()){const target=g.userData.target||new THREE.Vector3();g.position.lerp(target,dt*1.8);g.position.y=0;g.rotation.y=.12*Math.sin(elapsed*.7+g.userData.phase);g.position.z+=Math.sin(elapsed*g.userData.walk+g.userData.phase)*.012;if(elapsed%1<.02){g.position.x+=(Math.random()-.5)*.005}};
let desired=defaultPos();let look=new THREE.Vector3(0,2,-35);const subjects=[...players.values()].sort((a,b)=>b.userData.score-a.userData.score);const subject=subjects.find(g=>g.userData.cameraUntil&&g.userData.cameraUntil>elapsed)||subjects[0];if(cameraMode==='subject'&&subject&&subject.userData.cameraUntil>elapsed){desired=subject.position.clone().add(new THREE.Vector3(9,7,10));look.copy(subject.position).add(new THREE.Vector3(0,2,0))}else if(cameraMode==='catapult'&&cameraUntil>elapsed){desired=new THREE.Vector3(24,18,12);look.set(0,3,-18)}else if(cameraMode==='mehter'&&cameraUntil>elapsed){desired=new THREE.Vector3(16,10,22);look.set(0,2,-8)}else{cameraMode='court';subject.userData.cameraUntil=0}
if(subjects[0]?.userData.rank==='Vezir'&&cameraMode==='court')look.z=-70;
if(innerHeight>innerWidth){desired.multiplyScalar(1.22);desired.x*=.9}
if(shake>0){desired.x+=(Math.random()-.5)*shake;desired.y+=(Math.random()-.5)*shake;shake*=.88;if(shake<.01)shake=0}camera.position.lerp(desired,dt*1.15);camera.lookAt(look);renderer.render(scene,camera)}animate();
