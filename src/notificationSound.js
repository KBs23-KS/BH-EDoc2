/** A quiet, local notification chime. No remote audio URL or paid service. */
export async function playNotification(volume=50){
 if(!volume||typeof window==="undefined")return;
 const Context=window.AudioContext||window.webkitAudioContext;
 if(!Context)return;
 let ctx;
 try{
   ctx=new Context();
   await ctx.resume();
   const start=ctx.currentTime;
   for(const [frequency,offset,amount] of [[880,0,.16],[1174.66,.08,.12]]){
     const o=ctx.createOscillator(),gain=ctx.createGain();
     o.type="sine";o.frequency.value=frequency;
     gain.gain.setValueAtTime(0,start+offset);
     gain.gain.linearRampToValueAtTime(Math.min(0.22,(volume/100)*amount),start+offset+.018);
     gain.gain.exponentialRampToValueAtTime(.001,start+offset+.4);
     o.connect(gain);gain.connect(ctx.destination);
     o.start(start+offset);o.stop(start+offset+.42);
   }
   setTimeout(()=>ctx.close().catch(()=>{}),900);
 }catch(e){if(ctx)ctx.close().catch(()=>{});}
}
