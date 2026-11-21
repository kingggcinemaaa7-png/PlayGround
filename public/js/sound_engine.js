export class SoundEngine {
  constructor(){this.ctx=null;this.master=null;this.muted=false;this.volume=.7;this.marchTimer=null}
  init(){if(this.ctx)return this.ctx.resume();this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);}
  setVolume(v){this.volume=+v||0;if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.ctx.currentTime,.05)}
  mute(m){this.muted=m;if(this.master)this.master.gain.setTargetAtTime(m?0:this.volume,this.ctx.currentTime,.05)}
  tone(freq,dur,type='sine',gain=.12,endFreq=null){if(!this.ctx||this.muted)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(this.master);o.start(t);o.stop(t+dur)}
  noise(dur,gain=.12,filterType='highpass',freq=1000,sweep=null){if(!this.ctx||this.muted)return;const t=this.ctx.currentTime,n=Math.max(1,this.ctx.sampleRate*dur),b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n*.7);const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=b;f.type=filterType;f.frequency.setValueAtTime(freq,t);if(sweep)f.frequency.exponentialRampToValueAtTime(sweep,t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(this.master);s.start()}
  marching(intensity=1){if(this.ctx&&this.marchTimer)return;this.init();this.marchTimer=setInterval(()=>{this.tone(70,.16,'sine',.06*(.5+intensity/150),42);if(Math.random()>.35)this.noise(.08,.025,'highpass',3000)},320)}
  stopMarching(){clearInterval(this.marchTimer);this.marchTimer=null}
  playMehterDrum(){this.init();for(let i=0;i<6;i++)setTimeout(()=>{this.tone(110,.45,'triangle',.22,38);this.noise(.12,.16,'highpass',3500)},i*420)}
  playCatapultFire(){this.init();this.noise(.55,.10,'bandpass',700,220);this.tone(180,.7,'sawtooth',.12,55);setTimeout(()=>{this.tone(55,.9,'sine',.35,28);this.noise(.7,.25,'lowpass',450)},650)}
  playHorseNeigh(){this.init();this.tone(280,1.2,'sawtooth',.09,720);setTimeout(()=>this.tone(190,.8,'triangle',.08,510),100);for(let i=0;i<4;i++)setTimeout(()=>this.noise(.07,.07,'lowpass',300),i*180)}
  playGrandSeal(){this.init();this.tone(48,1.4,'sine',.4,32);this.tone(920,.9,'triangle',.08,180);setTimeout(()=>this.noise(.5,.14,'bandpass',2200),80)}
  playVizierFanfare(){this.init();[196,233,261,293,392,466].forEach((f,i)=>setTimeout(()=>this.tone(f,1.1,'sawtooth',.11),i*110))}
}
