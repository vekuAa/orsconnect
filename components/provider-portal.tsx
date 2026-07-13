"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance";
import type { PaymentMode } from "@/lib/types";
import { Icon } from "./icons";
import styles from "./provider-portal.module.css";

type WorkDayType = "full" | "half" | "absent";
interface Site { id:string; name:string; city:string; address:string; }
interface WorkDay { work_date:string; started_at:string|null; ended_at:string|null; day_type:WorkDayType; submitted_at:string|null; }
interface Contract { payment_mode:PaymentMode; day_rate:number|string; daily_deduction:number|string; }
interface Vehicle { id:string; plate:string; model:string|null; status:"waiting"|"washing"|"done"|"cancelled"; provider_id:string|null; created_at:string; }
interface Finance { entry_date:string; provider_amount:number|string; }

const numeric=(v:number|string|null|undefined)=>Number(v??0)||0;
const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const timeLabel=(v:string|null)=>v?new Date(v).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):"—";

export function ProviderPortal(){
  const supabase=useMemo(()=>createClient(),[]);
  const [userId,setUserId]=useState("");
  const [name,setName]=useState("");
  const [sites,setSites]=useState<Site[]>([]);
  const [siteId,setSiteId]=useState("");
  const [days,setDays]=useState<WorkDay[]>([]);
  const [contract,setContract]=useState<Contract|null>(null);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [finances,setFinances]=useState<Finance[]>([]);
  const [loading,setLoading]=useState(true);
  const [action,setAction]=useState("");
  const [error,setError]=useState("");

  const load=useCallback(async(id:string,uid:string)=>{
    const today=localDate();
    const monthStart=`${today.slice(0,7)}-01`;
    const next=new Date(); next.setMonth(next.getMonth()+1,1);
    const monthEnd=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-01`;
    const start=new Date(); start.setHours(0,0,0,0);
    const [d,c,v,f]=await Promise.all([
      supabase.from("work_days").select("work_date,started_at,ended_at,day_type,submitted_at").eq("provider_id",uid).eq("concession_id",id).gte("work_date",monthStart).lt("work_date",monthEnd),
      supabase.from("provider_contracts").select("payment_mode,day_rate,daily_deduction").eq("provider_id",uid).eq("concession_id",id).eq("active",true).limit(1).maybeSingle(),
      supabase.from("vehicles").select("id,plate,model,status,provider_id,created_at").eq("concession_id",id).neq("status","cancelled").gte("created_at",start.toISOString()).order("created_at",{ascending:false}),
      supabase.from("financial_entries").select("entry_date,provider_amount").eq("provider_id",uid).eq("concession_id",id).gte("entry_date",monthStart).lt("entry_date",monthEnd),
    ]);
    const e=d.error??c.error??v.error??f.error;
    if(e){setError(e.message);return;}
    setDays((d.data??[]) as WorkDay[]); setContract(c.data as Contract|null); setVehicles((v.data??[]) as Vehicle[]); setFinances((f.data??[]) as Finance[]);
  },[supabase]);

  useEffect(()=>{let active=true;(async()=>{
    const {data:{user}}=await supabase.auth.getUser(); if(!user){setLoading(false);return;}
    const [{data:p,error:pe},{data:a,error:ae}]=await Promise.all([
      supabase.from("profiles").select("full_name,role").eq("id",user.id).single(),
      supabase.from("concession_access").select("concession_id").eq("profile_id",user.id),
    ]);
    if(!active)return; if(pe||ae||!p){setError(pe?.message??ae?.message??"Profil introuvable");setLoading(false);return;}
    const ids=(a??[]).map(x=>x.concession_id as string);
    const {data:s,error:se}=ids.length?await supabase.from("concessions").select("id,name,city,address").in("id",ids).eq("active",true).is("archived_at",null):{data:[],error:null};
    if(se){setError(se.message);setLoading(false);return;}
    const mapped=(s??[]) as Site[]; const first=mapped[0]?.id??"";
    setUserId(user.id);setName(p.full_name);setSites(mapped);setSiteId(first);
    if(first)await load(first,user.id); setLoading(false);
  })();return()=>{active=false}},[load,supabase]);

  const changeSite=async(id:string)=>{setSiteId(id);setLoading(true);await load(id,userId);setLoading(false)};
  const rpc=async(kind:"start"|"end")=>{setAction(kind);setError("");const {error:e}=await supabase.rpc(kind==="start"?"start_work_day":"end_work_day",{p_concession_id:siteId});if(e)setError(e.message);await load(siteId,userId);setAction("")};

  const today=localDate(); const todayDay=days.find(d=>d.work_date===today)??null;
  const own=vehicles.filter(v=>v.provider_id===userId); const done=own.filter(v=>v.status==="done").length; const washing=own.filter(v=>v.status==="washing").length;
  const monthRevenue=finances.reduce((s,x)=>s+numeric(x.provider_amount),0);
  const todayRevenue=finances.filter(x=>x.entry_date===today).reduce((s,x)=>s+numeric(x.provider_amount),0);
  const equivalent=days.reduce((s,d)=>s+(d.day_type==="full"?1:d.day_type==="half"?.5:0),0);
  const status=!todayDay?.started_at?"Non démarrée":todayDay.ended_at?"Terminée":"En cours";
  const site=sites.find(s=>s.id===siteId);

  if(loading)return <div className={styles.panel}><div className={styles.empty}>Chargement de ton espace…</div></div>;
  return <div className={styles.page}>
    {error&&<div className={styles.alert}>{error}</div>}
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>Espace prestataire</span>
        <h1 className={styles.heroTitle}>Bonjour {name.split(" ")[0] || ""} 👋</h1>
        <p className={styles.muted}>Retrouve l’essentiel de ta journée sans mélanger calendrier, véhicules et revenus.</p>
        {sites.length>1&&<select className={styles.siteSelect} value={siteId} onChange={e=>void changeSite(e.target.value)}>{sites.map(s=><option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}</select>}
      </div>
      <div className={styles.statusCard}>
        <div className={styles.statusTop}><div><small className={styles.muted}>Aujourd’hui · {site?.name}</small><h2>{status}</h2></div><span className={`${styles.statusBadge} ${status==="En cours"?styles.statusActive:status==="Terminée"?styles.statusDone:""}`}>{status}</span></div>
        <div className={styles.timeRow}><div><span>Début</span><strong>{timeLabel(todayDay?.started_at??null)}</strong></div><div><span>Fin</span><strong>{timeLabel(todayDay?.ended_at??null)}</strong></div><div><span>Type</span><strong>{todayDay?.day_type==="half"?"Demi-journée":todayDay?.day_type==="absent"?"Absent":"Journée"}</strong></div></div>
        <div className={styles.actions}>{!todayDay?.started_at?<button className={styles.primary} onClick={()=>void rpc("start")} disabled={!!action}><Icon name="clock" size={18}/>{action==="start"?"Démarrage…":"Commencer"}</button>:!todayDay.ended_at?<button className={styles.primary} onClick={()=>void rpc("end")} disabled={!!action}><Icon name="check" size={18}/>{action==="end"?"Clôture…":"Terminer"}</button>:<Link className={styles.secondary} href="/prestataire/journees"><Icon name="calendar" size={18}/>Voir ma journée</Link>}</div>
      </div>
    </section>

    <section className={styles.stats}>
      <article className={styles.stat}><span className={styles.statIcon}><Icon name="car"/></span><div><small>Terminés aujourd’hui</small><strong>{done}</strong><p>{washing} en lavage</p></div></article>
      <article className={styles.stat}><span className={styles.statIcon}><Icon name="calendar"/></span><div><small>Jours équivalents</small><strong>{equivalent.toLocaleString("fr-FR")}</strong><p>sur le mois en cours</p></div></article>
      <article className={styles.stat}><span className={styles.statIcon}><Icon name="wallet"/></span><div><small>CA aujourd’hui</small><strong>{formatCurrency(todayRevenue)}</strong><p>montant enregistré</p></div></article>
      <article className={styles.stat}><span className={styles.statIcon}><Icon name="trend"/></span><div><small>CA du mois</small><strong>{formatCurrency(monthRevenue)}</strong><p>{contract?.payment_mode==="day"?"forfait journalier":"paiement à la voiture"}</p></div></article>
    </section>

    <section className={styles.grid2}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Activité</span><h2>Mes véhicules du jour</h2></div><Link className={styles.secondary} href={`/vehicles?site=${siteId}`}>Voir tout</Link></div><div className={styles.list}>{own.length?own.slice(0,6).map(v=><div className={styles.row} key={v.id}><div><strong>{v.plate}</strong><small>{v.model||"Modèle non renseigné"}</small></div><span className={styles.tag}>{v.status==="done"?"Terminé":v.status==="washing"?"En lavage":"À laver"}</span><span>{new Date(v.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span></div>):<div className={styles.empty}>Aucun véhicule pris en charge aujourd’hui.</div>}</div></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span className={styles.eyebrow}>Accès rapide</span><h2>Mes outils</h2></div></div><div className={styles.quickLinks}><Link className={styles.quickLink} href={`/vehicles?site=${siteId}`}><span className={styles.quickIcon}><Icon name="car"/></span><div><strong>Véhicules</strong><span>Ajouter, modifier et suivre les lavages</span></div></Link><Link className={styles.quickLink} href="/prestataire/journees"><span className={styles.quickIcon}><Icon name="calendar"/></span><div><strong>Mes journées</strong><span>Calendrier, demi-journée ou absence</span></div></Link><Link className={styles.quickLink} href="/prestataire/revenus"><span className={styles.quickIcon}><Icon name="wallet"/></span><div><strong>Mes revenus</strong><span>Suivre ton CA jour après jour</span></div></Link></div></article>
    </section>
  </div>
}
