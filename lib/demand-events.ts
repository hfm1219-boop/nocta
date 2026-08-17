"use client";

export type DemandEventType = "venue_impression"|"venue_view"|"venue_click"|"event_impression"|"event_view"|"event_click"|"promotion_impression"|"promotion_view"|"promotion_click"|"reservation_started"|"ticket_checkout_started"|"venue_checkin";

function sessionId(){
  const key="nocta_demand_session";let value=sessionStorage.getItem(key);
  if(!value){value=crypto.randomUUID();sessionStorage.setItem(key,value);}return value;
}
export function trackDemand(eventType:DemandEventType,entityType?:"venue"|"event"|"promotion",entityKey?:string){
  const body=JSON.stringify({eventType,sessionId:sessionId(),entityType,entityKey,path:location.pathname,device:innerWidth<768?"mobile":"desktop",dedupKey:eventType.includes("impression")||eventType.includes("view")?`${sessionId()}:${eventType}:${entityKey??location.pathname}`:undefined});
  if(navigator.sendBeacon){navigator.sendBeacon("/api/events",new Blob([body],{type:"application/json"}));return;}
  void fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true});
}
