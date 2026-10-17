// Every public action remains visible for at least 3.2 seconds. Audible,
// foreground clients can extend that pause until speech ends, up to 9 seconds.
export class NarrationGate {
  id=0;
  waiting=new Set();
  notBefore=0;
  expires=0;
  observe(id,listeners,now=Date.now()) {
    if(!id||id<=this.id)return false;
    this.id=id;this.waiting=new Set(listeners);
    this.notBefore=now+3200;this.expires=now+9000;return true;
  }
  acknowledge(listener,id) {return id===this.id&&this.waiting.delete(listener);}
  remove(listener) {return this.waiting.delete(listener);}
  delay(now=Date.now()) {return Math.max(0,this.notBefore-now,this.waiting.size?this.expires-now:0);}
}
