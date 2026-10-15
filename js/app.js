(() => {
"use strict";
const $=id=>document.getElementById(id), STORE="nutritrack-personal-v2", DB="nutritrack-photo-db", DB_VERSION=1;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const defaults={profile:null,meals:[]};let state=load(),pendingPhoto=null,toastTimer;
function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(STORE)||"{}")}}catch{return {...defaults}}}
function save(){localStorage.setItem(STORE,JSON.stringify(state))}
function fmt(n){return Math.round(Number(n)||0).toLocaleString("ru-RU")}
function val(id){return Math.max(0,Number($(id).value)||0)}
function round(n){return Math.round(n*10)/10}
function notify(s){const t=$("toast");t.textContent=s;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("photos"))db.createObjectStore("photos",{keyPath:"id"})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function putPhoto(file){const db=await openDB();const id=crypto.randomUUID?crypto.randomUUID():String(Date.now());return new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").put({id,blob:file,mime:file.type,createdAt:Date.now()});tx.oncomplete=()=>{db.close();resolve(id)};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function getPhoto(id){if(!id)return null;try{const db=await openDB();return await new Promise((resolve,reject)=>{const tx=db.transaction("photos","readonly"),req=tx.objectStore("photos").get(id);req.onsuccess=()=>{db.close();resolve(req.result||null)};req.onerror=()=>{db.close();reject(req.error)}})}catch{return null}}
async function deletePhoto(id){if(!id)return;try{const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}}
function dayMeals(date=today()){return state.meals.filter(m=>m.date===date)}
function totals(items){return items.reduce((a,m)=>({kcal:a.kcal+(+m.kcal||0),protein:a.protein+(+m.protein||0),fat:a.fat+(+m.fat||0),carbs:a.carbs+(+m.carbs||0)}),{kcal:0,protein:0,fat:0,carbs:0})}
function calc(p){const bmr=10*p.weight+6.25*p.height-5*p.age+(p.sex==="male"?5:-161),tdee=bmr*p.activity;let calories=Math.round(tdee*(p.goal==="lose"?.82:p.goal==="gain"?1.1:1));calories=Math.max(1200,Math.min(5000,calories));const protein=Math.round(p.weight*(p.goal==="gain"?1.8:1.6)),fat=Math.round(calories*.27/9),carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));return {bmr:Math.round(bmr),tdee:Math.round(tdee),calories,protein,fat,carbs}}
function updateDashboard(){
 const p=state.profile,items=dayMeals(),t=totals(items);
 $("todayLabel").textContent=new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
 $("profilePrompt").classList.toggle("hidden",!!p);
 const goal=p?.calories||0;$("goalCalories").textContent=p?fmt(goal):"Настрой профиль";
 $("consumedCalories").textContent=fmt(t.kcal);$("remainingCalories").textContent=p?fmt(goal-t.kcal):"—";$("remainingCalories").style.color=p&&t.kcal>goal?"var(--red)":"var(--text)";
 $("calorieProgress").style.width=Math.min(100,goal?t.kcal/goal*100:0)+"%";
 [["protein",t.protein,p?.protein],["fat",t.fat,p?.fat],["carb",t.carbs,p?.carbs]].forEach(([k,n,g])=>{$(k+"Now").textContent=fmt(n);$(k+"Goal").textContent=g?fmt(g):"—";$(k==="protein"?"proteinBar":k==="fat"?"fatBar":"carbBar").style.width=Math.min(100,g?n/g*100:0)+"%"});
 $("mealCount").textContent=items.length?`${items.length} записей сегодня`:"Пока пусто";renderMeals($("todayMeals"),items,true);renderWeekMini();
}
function renderMeals(container,items,del){
 container.innerHTML="";if(!items.length){container.innerHTML='<div class="empty-state">Записей пока нет.<br>Добавь продукт или фотографию блюда.</div>';return}
 ["Завтрак","Обед","Ужин","Перекус"].forEach(type=>{const subset=items.filter(m=>m.type===type);if(!subset.length)return;const title=document.createElement("div");title.className="meal-group-title";title.textContent=type;container.append(title);subset.forEach(m=>{const row=document.createElement("div");row.className="meal-item";const emoji=document.createElement("div");emoji.className="meal-emoji";emoji.textContent=m.photoId?"📸":"🍽️";const info=document.createElement("div");info.className="meal-info";const name=document.createElement("b");name.textContent=m.name;const meta=document.createElement("small");meta.textContent=`${fmt(m.grams)} г · Б ${fmt(m.protein)} г · Ж ${fmt(m.fat)} г · У ${fmt(m.carbs)} г`;info.append(name,meta);if(Array.isArray(m.items)&&m.items.length){const breakdown=document.createElement("small");breakdown.textContent="AI: "+m.items.map(x=>x.name).join(", ");info.append(breakdown)}const kcal=document.createElement("div");kcal.className="meal-kcal";kcal.textContent=`${fmt(m.kcal)} ккал`;const actions=document.createElement("div");actions.className="meal-actions";if(m.photoId){const view=document.createElement("button");view.className="delete-btn";view.textContent="▧";view.title="Посмотреть фото";view.onclick=()=>openMealPhoto(m);actions.append(view)}if(del){const x=document.createElement("button");x.className="delete-btn";x.textContent="×";x.title="Удалить";x.onclick=()=>removeMeal(m.id);actions.append(x)}row.append(emoji,info,kcal,actions);container.append(row)})});
}
function addMeal(data,photoId=null){const grams=Number(data.grams)||100,s=grams/100;state.meals.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),date:data.date||today(),type:data.type||"Перекус",name:data.name.trim(),grams,kcal:round(Number(data.kcal100)*s),protein:round(Number(data.protein100)*s),fat:round(Number(data.fat100)*s),carbs:round(Number(data.carbs100)*s),photoId,items:data.items||null,createdAt:Date.now()});save();updateDashboard();renderDiary();renderWeek();notify("Сохранено на этом устройстве")}
async function removeMeal(id){const m=state.meals.find(x=>x.id===id);state.meals=state.meals.filter(x=>x.id!==id);if(m?.photoId)await deletePhoto(m.photoId);save();updateDashboard();renderDiary();renderWeek();notify("Запись удалена")}
function go(view){document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+view));document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.nav===view));if(view==="diary")renderDiary();if(view==="week")renderWeek();window.scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.nav)));$("profileOpen").onclick=()=>go("profile");
function profileToForm(){if(!state.profile)return;const p=state.profile;["age","sex","height","weight","targetWeight","activity","goal"].forEach(k=>$(k).value=p[k]??"")}
function saveProfile(e){e.preventDefault();const p={age:val("age"),sex:$("sex").value,height:val("height"),weight:val("weight"),targetWeight:val("targetWeight"),activity:Number($("activity").value),goal:$("goal").value};if(!p.age||p.age<18||p.age>100||!p.height||p.height<120||p.height>230||!p.weight||p.weight<35||p.weight>300||!p.targetWeight||p.targetWeight<35||p.targetWeight>300){notify("Проверь возраст, рост и оба значения веса");return}if(p.targetWeight<p.weight)p.goal="lose";else if(p.targetWeight>p.weight)p.goal="gain";else p.goal="maintain";$("goal").value=p.goal;const r=calc(p);state.profile={...p,...r};save();$("calculationResult").classList.remove("hidden");$("calculationResult").innerHTML=`Основной обмен (BMR): <b>${fmt(r.bmr)} ккал</b><br>Оценочный расход за день: <b>${fmt(r.tdee)} ккал</b><br>Цель на день: <b>${fmt(r.calories)} ккал</b><br>Белки: <b>${r.protein} г</b> · Жиры: <b>${r.fat} г</b> · Углеводы: <b>${r.carbs} г</b><br><span class="muted">Ориентировочная оценка по формуле Mifflin–St Jeor для взрослых. Не медицинская рекомендация.</span>`;updateDashboard();notify("Профиль сохранён");}
$("profileForm").addEventListener("submit",saveProfile);
function previewFood(){const g=val("foodGrams"),k=val("foodKcal");$("foodPreview").textContent=`Порция: ${fmt(g)} г · ${fmt(k*g/100)} ккал`}
["foodGrams","foodKcal"].forEach(id=>$(id).addEventListener("input",previewFood));
$("foodForm").addEventListener("submit",e=>{e.preventDefault();addMeal({name:$("foodName").value,type:$("mealType").value,grams:val("foodGrams"),kcal100:val("foodKcal"),protein100:val("foodProtein"),fat100:val("foodFat"),carbs100:val("foodCarbs")});e.target.reset();$("foodGrams").value=100;["foodProtein","foodFat","foodCarbs"].forEach(id=>$(id).value=0);previewFood();go("dashboard")});
let aiBreakdown=null;
const GEMINI_BASE="https://generativelanguage.googleapis.com/v1beta";
// Запасной список моделей. Основной способ — спросить у Google, какие модели доступны этому ключу (старые модели Google отключает).
const FALLBACK_MODELS=["gemini-3.5-flash","gemini-3.1-flash-lite","gemini-flash-latest","gemini-flash-lite-latest"];
const AI_PROMPT=`Ты — аккуратный помощник по оценке питания. Посмотри на фото блюда. Определи видимые компоненты еды и оцени съедобную массу каждого в граммах. Верни ТОЛЬКО JSON по схеме. Пищевая ценность указывается на 100 г готового продукта (не на всю порцию). Бери типичные значения для приготовленной еды; учитывай видимые соусы и масло, но не утверждай ничего с уверенностью. Если еда или порция неоднозначны — напиши об этом в notes и используй осторожные оценки. Не придумывай ингредиенты, которых не видно. Названия и заметки пиши по-русски. Сумма калорий должна примерно соответствовать БЖУ (4 ккал/г белка, 9 — жира, 4 — углеводов). Если на фото нет еды, верни пустой список items. Дай короткое общее название блюда.`;
const AI_SCHEMA={type:"OBJECT",properties:{mealName:{type:"STRING"},notes:{type:"STRING"},items:{type:"ARRAY",items:{type:"OBJECT",properties:{name:{type:"STRING"},grams:{type:"NUMBER"},kcal100:{type:"NUMBER"},protein100:{type:"NUMBER"},fat100:{type:"NUMBER"},carbs100:{type:"NUMBER"},confidence:{type:"STRING",enum:["низкая","средняя","высокая"]}},required:["name","grams","kcal100","protein100","fat100","carbs100","confidence"]}}},required:["mealName","notes","items"]};
const aiPrefs=()=>({key:localStorage.getItem("nutritrack-gemini-key")||"",endpoint:localStorage.getItem("nutritrack-ai-endpoint")||"",code:localStorage.getItem("nutritrack-ai-code")||""});
const cleanKey=v=>String(v||"").replace(/[\s"'“”‘’`]+/g,"");
const hasAI=p=>!!(p.key||(p.endpoint&&p.code));
const prefs=aiPrefs();$("geminiKey").value=prefs.key;$("aiEndpoint").value=prefs.endpoint;$("aiAccessCode").value=prefs.code;
function refreshAIButton(){const p=aiPrefs();$("analyzePhoto").disabled=!(pendingPhoto&&hasAI(p));if(pendingPhoto&&!hasAI(p))$("aiStatus").textContent="Фото готово. Осталось добавить ключ Gemini (блок «Подключение ИИ» ниже) и нажать «Сохранить».";}
$("saveAISettings").onclick=()=>{
 const key=cleanKey($("geminiKey").value),endpoint=$("aiEndpoint").value.trim(),code=$("aiAccessCode").value.trim();
 if(!key&&!endpoint&&!code){notify("Вставь ключ Gemini");return}
 if(key&&!/^[\x21-\x7E]{20,}$/.test(key)){notify("Ключ слишком короткий или содержит лишние символы. Скопируй его целиком");return}
 $("geminiKey").value=key;
 if(endpoint||code){try{const u=new URL(endpoint);if(u.protocol!=="https:")throw new Error()}catch{notify("Введи корректный HTTPS URL endpoint");return}if(!code){notify("Введи код доступа к endpoint");return}}
 const set=(k,v)=>v?localStorage.setItem(k,v):localStorage.removeItem(k);
 if(key!==aiPrefs().key)localStorage.removeItem("nutritrack-ai-model");
 set("nutritrack-gemini-key",key);set("nutritrack-ai-endpoint",endpoint);set("nutritrack-ai-code",code);
 refreshAIButton();if(pendingPhoto&&hasAI(aiPrefs()))$("aiStatus").textContent="Фото готово к анализу.";notify("Настройки ИИ сохранены на этом устройстве")};
["geminiKey","aiEndpoint","aiAccessCode"].forEach(id=>$(id).addEventListener("input",()=>{}));
function onPhotoChosen(input){const f=input.files?.[0];if(!f)return;if(f.type&&!f.type.startsWith("image/")){notify("Выбери изображение");input.value="";return}if(f.size>25*1024*1024){notify("Фото должно быть меньше 25 МБ");input.value="";return}pendingPhoto=f;aiBreakdown=null;$("aiResults").classList.add("hidden");const old=$("photoPreview").dataset.url;if(old)URL.revokeObjectURL(old);const url=URL.createObjectURL(f);$("photoPreview").src=url;$("photoPreview").dataset.url=url;$("photoPreview").classList.remove("hidden");$("photoFoodForm").classList.remove("hidden");$("photoFoodName").value="";$("photoStatus").textContent="Фото выбрано. Нажми «Распознать еду на фото», затем проверь продукты и порции.";$("aiStatus").textContent=hasAI(aiPrefs())?"Фото готово к анализу.":"Фото готово. Осталось добавить ключ Gemini (блок «Подключение ИИ» ниже).";previewPhotoFood();refreshAIButton();input.value=""}
["foodPhotoCamera","foodPhotoGallery"].forEach(id=>$(id).addEventListener("change",e=>onPhotoChosen(e.target)));
async function compressedImage(file){
 const bitmapSource=await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const i=new Image();i.onload=()=>{resolve({img:i,url})};i.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("decode"))};i.src=url});
 const {img,url}=bitmapSource;
 try{
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;if(!w||!h)throw new Error("decode");
  const scale=Math.min(1,1400/Math.max(w,h));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const dataUrl=canvas.toDataURL("image/jpeg",.85);const data=dataUrl.split(",")[1];if(!data)throw new Error("encode");
  return {mimeType:"image/jpeg",imageBase64:data};
 }finally{URL.revokeObjectURL(url)}
}
function clampNum(v,min,max,fb){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fb}
function normalizeAI(r){
 const items=(Array.isArray(r?.items)?r.items:[]).slice(0,20).map(x=>({name:String(x?.name||"Продукт").slice(0,100),grams:clampNum(x?.grams,1,2000,100),kcal100:clampNum(x?.kcal100,0,1000,0),protein100:clampNum(x?.protein100,0,100,0),fat100:clampNum(x?.fat100,0,100,0),carbs100:clampNum(x?.carbs100,0,100,0),confidence:["низкая","средняя","высокая"].includes(String(x?.confidence))?String(x.confidence):"средняя"}));
 return {mealName:String(r?.mealName||"").slice(0,120),notes:String(r?.notes||"Оценка приблизительная.").slice(0,500),items};
}
async function fetchJSON(url,opts={},ms=60000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
 try{const res=await fetch(url,{...opts,signal:c.signal});const data=await res.json().catch(()=>({}));return {res,data}}
 catch(e){if(e.name==="AbortError")throw new Error("Сервер слишком долго отвечает. Попробуй ещё раз.");throw new Error("Нет связи с сервером ИИ. Проверь интернет (и VPN, если Gemini недоступен в твоём регионе).")}
 finally{clearTimeout(t)}
}
function geminiError(status,data){
 const msg=String(data?.error?.message||"");let text,fatal=false;
 if(/location is not supported/i.test(msg)){text="Gemini API недоступен в твоём регионе. Включи VPN и попробуй снова.";fatal=true}
 else if(/API key (not valid|expired)|API_KEY_INVALID|invalid api key/i.test(msg)||status===401){text="Google не принял ключ"+(msg?" («"+msg.slice(0,140)+"»)":"")+". Создай новый ключ на aistudio.google.com/apikey и вставь его целиком.";fatal=true}
 else if(status===403){text="Доступ запрещён"+(msg?" («"+msg.slice(0,140)+"»)":"")+". Создай новый ключ на aistudio.google.com/apikey.";fatal=true}
 else if(status===429){text="Превышен лимит запросов Gemini. Подожди минуту и попробуй снова (на бесплатном тарифе есть дневной лимит).";}
 else if(status===404){text="Модель Gemini недоступна.";}
 else if(status===503){text="Сервис Gemini перегружен. Попробуй ещё раз через минуту.";}
 else text="Ошибка Gemini ("+status+")"+(msg?": "+msg.slice(0,160):"");
 const e=new Error(text);e.fatal=fatal;e.status=status;e.msg=msg;return e;
}
async function geminiModels(key){
 const {res,data}=await fetchJSON(`${GEMINI_BASE}/models?pageSize=200&key=${encodeURIComponent(key)}`,{headers:{"x-goog-api-key":key}},20000);
 if(!res.ok)throw geminiError(res.status,data);
 const parse=n=>{const m=n.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/);return m?{v:parseFloat(m[1]),lite:m[2]?1:0}:null};
 return (data.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>String(m.name).replace(/^models\//,"")).map(n=>({n,i:parse(n)})).filter(x=>x.i).sort((a,b)=>b.i.v-a.i.v||a.i.lite-b.i.lite).map(x=>x.n);
}
async function analyzeWithGemini(image,key){
 let discovered=[];try{discovered=await geminiModels(key)}catch(e){if(e.fatal)throw e}
 const cached=localStorage.getItem("nutritrack-ai-model");
 const candidates=[...new Set([cached,...discovered,...FALLBACK_MODELS].filter(Boolean))].slice(0,6);
 const body=JSON.stringify({contents:[{role:"user",parts:[{text:AI_PROMPT},{inline_data:{mime_type:image.mimeType,data:image.imageBase64}}]}],generationConfig:{responseMimeType:"application/json",responseSchema:AI_SCHEMA,maxOutputTokens:8192}});
 let lastErr=null;
 for(const model of candidates){
  const {res,data}=await fetchJSON(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body});
  if(res.ok){
   if(data?.promptFeedback?.blockReason)throw new Error("Gemini отклонил это фото. Попробуй другое.");
   const raw=(data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim();
   if(!raw){lastErr=new Error("ИИ не вернул результат. Попробуй более чёткое фото.");continue}
   let parsed;try{parsed=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,""))}catch{lastErr=new Error("ИИ вернул неполный ответ. Попробуй ещё раз.");continue}
   const result=normalizeAI(parsed);
   if(!result.items.length)throw new Error("ИИ не нашёл еду на фото. Попробуй другой ракурс или освещение.");
   localStorage.setItem("nutritrack-ai-model",model);return result;
  }
  const err=geminiError(res.status,data);if(err.fatal)throw err;lastErr=err;
  if([404,429,503].includes(res.status)||(res.status===400&&/not found|not supported|no longer available/i.test(err.msg)))continue;
  throw err;
 }
 throw lastErr||new Error("Не удалось получить ответ от Gemini.");
}
async function analyzeWithEndpoint(image,endpoint,code){
 const {res,data}=await fetchJSON(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-app-code":code},body:JSON.stringify(image)});
 if(!res.ok)throw new Error(data?.error||`Ошибка сервера (${res.status})`);
 const result=normalizeAI(data);if(!result.items.length)throw new Error("ИИ не нашёл еду на фото.");return result;
}
$("testAI").onclick=async()=>{const key=cleanKey($("geminiKey").value)||aiPrefs().key;if(!key){notify("Сначала вставь ключ Gemini");return}const b=$("testAI");b.disabled=true;b.textContent="Проверяю…";try{const models=await geminiModels(key);notify(models.length?"Ключ работает ✓ Модель: "+models[0]:"Ключ принят, но подходящих моделей не найдено")}catch(e){notify(e.message)}finally{b.disabled=false;b.textContent="Проверить ключ"}};
function showAIResult(result){aiBreakdown=result.items;const total=result.items.reduce((a,x)=>{const factor=Number(x.grams)/100;a.grams+=Number(x.grams);a.kcal+=Number(x.kcal100)*factor;a.protein+=Number(x.protein100)*factor;a.fat+=Number(x.fat100)*factor;a.carbs+=Number(x.carbs100)*factor;return a},{grams:0,kcal:0,protein:0,fat:0,carbs:0});$("photoFoodName").value=result.mealName||result.items.map(x=>x.name).join(" + ");$("photoGrams").value=Math.max(1,Math.round(total.grams));$("photoKcal").value=round(total.kcal/Math.max(1,total.grams)*100);$("photoProtein").value=round(total.protein/Math.max(1,total.grams)*100);$("photoFat").value=round(total.fat/Math.max(1,total.grams)*100);$("photoCarbs").value=round(total.carbs/Math.max(1,total.grams)*100);const rows=result.items.map(x=>`<div style="padding:8px 0;border-bottom:1px solid #23384a"><b>${escapeHtml(x.name)}</b><br><span class="muted">${fmt(x.grams)} г · ${fmt(x.kcal100* x.grams/100)} ккал · Б ${fmt(x.protein100*x.grams/100)} г · Ж ${fmt(x.fat100*x.grams/100)} г · У ${fmt(x.carbs100*x.grams/100)} г · уверенность: ${escapeHtml(x.confidence)}</span></div>`).join("");$("aiResults").innerHTML=`<b>AI нашёл ${result.items.length} компонента(ов)</b>${rows}<p>${escapeHtml(result.notes||"Оценка приблизительная.")}</p><p><b>Итого: ${fmt(total.kcal)} ккал</b> · Б ${fmt(total.protein)} г · Ж ${fmt(total.fat)} г · У ${fmt(total.carbs)} г</p><p class="muted small">Значения ниже усреднены по всей порции. Проверь и исправь их перед сохранением.</p>`;$("aiResults").classList.remove("hidden");$("photoStatus").textContent="AI завершил оценку. Проверь результат и сохрани блюдо.";previewPhotoFood()}
function previewPhotoFood(){const g=val("photoGrams"),k=val("photoKcal");const preview=$("photoNutritionPreview");if(preview)preview.textContent=`Порция: ${fmt(g)} г · ${fmt(k*g/100)} ккал`}
["photoGrams","photoKcal","photoProtein","photoFat","photoCarbs"].forEach(id=>$(id).addEventListener("input",previewPhotoFood));
$("analyzePhoto").onclick=async()=>{const p=aiPrefs();if(!pendingPhoto){notify("Сначала выбери фото");return}if(!hasAI(p)){notify("Сначала добавь ключ Gemini и нажми «Сохранить»");return}const button=$("analyzePhoto");button.disabled=true;button.textContent="Анализирую фото…";$("aiStatus").textContent="Отправляю уменьшенную копию фото на анализ. Это может занять до 30 секунд…";try{let image;try{image=await compressedImage(pendingPhoto)}catch{throw new Error("Не удалось прочитать фото. Если это формат HEIC, сделай снимок в JPG или выбери другое фото.")}const result=p.key?await analyzeWithGemini(image,p.key):await analyzeWithEndpoint(image,p.endpoint,p.code);showAIResult(result);$("aiStatus").textContent="Готово. Проверь результат ниже.";notify("ИИ распознал еду — проверь оценку")}catch(err){console.error(err);$("aiStatus").textContent=err.message||"Не удалось распознать фото.";notify(err.message||"Ошибка ИИ")}finally{button.textContent="✦ Распознать еду на фото";refreshAIButton()}};

$("photoFoodForm").addEventListener("submit",async e=>{e.preventDefault();if(!pendingPhoto){notify("Сначала выбери фото");return}try{const photoId=await putPhoto(pendingPhoto);addMeal({name:$("photoFoodName").value,type:$("photoMealType").value,grams:val("photoGrams"),kcal100:val("photoKcal"),protein100:val("photoProtein"),fat100:val("photoFat"),carbs100:val("photoCarbs"),items:aiBreakdown},photoId);e.target.reset();e.target.classList.add("hidden");$("aiResults").classList.add("hidden");const oldUrl=$("photoPreview").dataset.url;if(oldUrl){URL.revokeObjectURL(oldUrl);delete $("photoPreview").dataset.url}$("photoPreview").classList.add("hidden");$("photoStatus").textContent="Фото и запись сохранены локально.";$("aiStatus").textContent="Сначала выбери фото.";pendingPhoto=null;aiBreakdown=null;previewPhotoFood();refreshAIButton();go("dashboard")}catch(err){console.error(err);notify("Не удалось сохранить фото. Проверь память браузера.")}});
$("diaryDate").value=today();$("diaryDate").addEventListener("change",renderDiary);
function renderDiary(){const date=$("diaryDate").value||today(),items=dayMeals(date),t=totals(items);$("diaryCalories").textContent=fmt(t.kcal)+" ккал";$("diaryMacros").textContent=`Б ${fmt(t.protein)} г · Ж ${fmt(t.fat)} г · У ${fmt(t.carbs)} г`;renderMeals($("diaryMeals"),items,true)}
function isoOffset(n){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function weekData(){const p=state.profile;return Array.from({length:7},(_,i)=>{const date=isoOffset(i-6),items=dayMeals(date),t=totals(items);return {date,items,t,goal:p?.calories||0,logged:items.length>0,ok:!!p&&items.length>0&&t.kcal<=p.calories*1.1}})}
function renderWeekMini(){const el=$("weekMini");if(!el)return;const days=weekData(),logged=days.filter(d=>d.logged),ok=days.filter(d=>d.ok).length;el.innerHTML=`<div class="week-stats"><div><b>${logged.length}/7</b><small>дней с записями</small></div><div><b>${state.profile?ok+"/7":"—"}</b><small>дней в лимите</small></div></div><div class="week-bars">${days.map(d=>`<div class="week-day"><i class="${d.logged?(d.ok?"good":"over"):"empty"}" style="height:${d.goal?Math.max(4,Math.min(100,d.t.kcal/d.goal*100)):4}%"></i><small>${new Date(d.date+"T12:00:00").toLocaleDateString("ru-RU",{weekday:"short"}).slice(0,2)}</small></div>`).join("")}</div>`}
async function renderWeek(){const days=weekData(),logged=days.filter(d=>d.logged),within=days.filter(d=>d.ok),el=$("weekSummary");el.innerHTML=`<div class="week-stats"><div><b>${logged.length} из 7</b><small>дней с записями</small></div><div><b>${state.profile?within.length+" из 7":"Нет цели"}</b><small>дней в лимите</small></div></div><div class="week-bars large">${days.map(d=>`<div class="week-day"><i class="${d.logged?(d.ok?"good":"over"):"empty"}" style="height:${d.goal?Math.max(4,Math.min(100,d.t.kcal/d.goal*100)):4}%"></i><small>${new Date(d.date+"T12:00:00").toLocaleDateString("ru-RU",{weekday:"short"}).slice(0,2)}</small><b>${d.logged?fmt(d.t.kcal):"—"}</b></div>`).join("")}</div><p class="muted small">День считается в пределах лимита, если есть хотя бы одна запись и сумма не превышает цель более чем на 10%. Неполный дневник может занижать итог.</p><div class="preview-box">${state.profile?`Среднее за дни с записями: <b>${logged.length?fmt(logged.reduce((a,d)=>a+d.t.kcal,0)/logged.length):"—"} ккал</b>. Цель: <b>${fmt(state.profile.calories)} ккал/день</b>.`:"Сначала заполни профиль, чтобы сравнивать калории с дневной целью."}</div>`;
const gallery=$("photoGallery"),run=++weekRun;const cutoff=Date.now()-7*24*60*60*1000;const meals=state.meals.filter(m=>m.photoId&&m.createdAt>=cutoff).sort((a,b)=>b.createdAt-a.createdAt);if(!meals.length){galleryUrls.splice(0).forEach(u=>URL.revokeObjectURL(u));gallery.innerHTML='<div class="empty-state">За последние 7 дней фото пока нет.<br>Добавь еду через раздел «Фото еды».</div>';return}const cards=[],urls=[];for(const m of meals){const item=document.createElement("article");item.className="photo-card";const img=document.createElement("img");img.alt=m.name;img.loading="lazy";const record=await getPhoto(m.photoId);if(record?.blob){const u=URL.createObjectURL(record.blob);urls.push(u);img.src=u}const info=document.createElement("div");info.className="photo-card-info";const b=document.createElement("b");b.textContent=m.name;const sm=document.createElement("small");sm.textContent=`${new Date(m.date+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"})} · ${fmt(m.kcal)} ккал`;info.append(b,sm);item.append(img,info);item.onclick=()=>openMealPhoto(m);cards.push(item)}
if(run!==weekRun){urls.forEach(u=>URL.revokeObjectURL(u));return}
galleryUrls.splice(0).forEach(u=>URL.revokeObjectURL(u));galleryUrls.push(...urls);gallery.replaceChildren(...cards)}
let weekRun=0;const galleryUrls=[];
let lightboxUrl=null;
function closeLightbox(){$("lightbox").classList.add("hidden");$("lightboxImg").removeAttribute("src");if(lightboxUrl){URL.revokeObjectURL(lightboxUrl);lightboxUrl=null}}
async function openMealPhoto(m){const r=await getPhoto(m.photoId);if(!r?.blob){notify("Фото больше не найдено");return}if(lightboxUrl)URL.revokeObjectURL(lightboxUrl);lightboxUrl=URL.createObjectURL(r.blob);$("lightboxImg").src=lightboxUrl;$("lightboxCap").textContent=`${m.name} — ${fmt(m.kcal)} ккал`;$("lightbox").classList.remove("hidden")}
$("lightboxClose").onclick=closeLightbox;$("lightbox").addEventListener("click",e=>{if(e.target.id==="lightbox")closeLightbox()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeLightbox()});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("exportData").onclick=async()=>{const photos=[];for(const m of state.meals.filter(x=>x.photoId)){const r=await getPhoto(m.photoId);if(r?.blob)photos.push({mealId:m.id,name:m.name,photo:await blobData(r.blob)})}const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),profile:state.profile,meals:state.meals,photos},null,2)],{type:"application/json"});const a=document.createElement("a");const url=URL.createObjectURL(blob);a.href=url;a.download="nutritrack-backup.json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify("Резервная копия подготовлена")};
function blobData(blob){return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)})}
$("clearData").onclick=async()=>{if(!confirm("Удалить профиль, дневник и все сохранённые фото с этого браузера? Это нельзя отменить."))return;state={profile:null,meals:[]};save();try{const db=await openDB();await new Promise(resolve=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").clear();tx.oncomplete=resolve});db.close()}catch{}updateDashboard();renderDiary();renderWeek();$("calculationResult").classList.add("hidden");notify("Локальные данные удалены")};

const MEAL_TYPES=["Завтрак","Обед","Ужин","Перекус"];
function cleanMeal(m){if(!m||typeof m!=="object"||!m.name)return null;const n=(v,max)=>clampNum(v,0,max,0);return {id:String(m.id||(crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random())),date:/^\d{4}-\d{2}-\d{2}$/.test(String(m.date))?m.date:today(),type:MEAL_TYPES.includes(m.type)?m.type:"Перекус",name:String(m.name).slice(0,120),grams:clampNum(m.grams,1,20000,100),kcal:n(m.kcal,50000),protein:n(m.protein,5000),fat:n(m.fat,5000),carbs:n(m.carbs,5000),photoId:null,items:Array.isArray(m.items)?normalizeAI({items:m.items}).items:null,createdAt:Number(m.createdAt)||Date.now()}}
$("importData").onclick=()=>$("importFile").click();
$("importFile").addEventListener("change",async e=>{const f=e.target.files?.[0];e.target.value="";if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.meals))throw new Error("format");const known=new Set(state.meals.map(m=>m.id));const fresh=data.meals.map(cleanMeal).filter(m=>m&&!known.has(m.id));if(!confirm(`В копии найдено новых записей: ${fresh.length}. Добавить их к текущим данным? Существующие записи не изменятся.`))return;const photoByMeal=new Map((Array.isArray(data.photos)?data.photos:[]).filter(p=>p&&p.mealId&&typeof p.photo==="string"&&p.photo.startsWith("data:image/")).map(p=>[p.mealId,p.photo]));for(const m of fresh){const dataUrl=photoByMeal.get(m.id);if(dataUrl){try{const blob=await (await fetch(dataUrl)).blob();m.photoId=await putPhoto(blob)}catch{}}}state.meals.push(...fresh);if(!state.profile&&data.profile&&typeof data.profile==="object"){const p=data.profile;const ok=["age","height","weight","targetWeight","calories"].every(k=>Number.isFinite(Number(p[k])));if(ok){state.profile={...p};profileToForm()}}save();updateDashboard();renderDiary();renderWeek();notify(`Импортировано записей: ${fresh.length}`)}catch(err){console.error(err);notify("Не удалось прочитать файл резервной копии")}});
profileToForm();updateDashboard();renderDiary();renderWeek();previewFood();
if(!state.profile)setTimeout(()=>go("profile"),250);
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
})();