"use client";
import {useEffect}from"react";import{trackDemand,type DemandEventType}from"@/lib/demand-events";
export function DemandTracker({type,entityType,entityKey}:{type:DemandEventType;entityType?:"venue"|"event"|"promotion";entityKey?:string}){useEffect(()=>{trackDemand(type,entityType,entityKey)},[type,entityType,entityKey]);return null;}
