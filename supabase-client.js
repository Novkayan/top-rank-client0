(async()=>{
const T=window.TR;if(!T)return;const sb=T.sb;let session=(await sb.auth.getSession()).data.session;
if(!session){
  T.say('جاري تجهيز الحجز بدون كلمة مرور...');
  const {data,error}=await sb.auth.signInAnonymously();
  if(error){
    T.say('تعذر تفعيل الحجز بدون كلمة مرور');
    const warn=document.createElement('div');warn.id='trGuestError';
    warn.style.cssText='position:fixed;bottom:18px;left:18px;right:18px;z-index:99999;max-width:620px;margin:auto;padding:18px;border-radius:16px;background:#2b153d;color:#fff;border:1px solid #d7b36b;box-shadow:0 12px 32px #0008;text-align:center;line-height:1.8';
    warn.textContent='تعذر تشغيل الحجز بدون كلمة مرور. يجب تفعيل Anonymous Sign-ins من Supabase → Authentication → Providers → Anonymous Sign-ins. التفاصيل: '+error.message;
    document.body.appendChild(warn);
    return;
  }
  session=data.session;
}
let cities=[],services=[];
async function refresh(){try{const rows=await T.getBookings(),cm=new Map(cities.map(c=>[c.id,c.name_ar]));localStorage.setItem('baytna_royal_client_v9_orders',JSON.stringify(rows.map(r=>T.toClient(r,cm))));if(typeof render==='function')render();T.say('متصل بـ Supabase — الحجوزات محدثة')}catch(e){T.say('تعذر تحميل حجوزاتك: '+e.message)}}
try{[cities,services]=await Promise.all([T.getCities(),T.getServices()]);}catch(e){T.say('خطأ قراءة البيانات: '+e.message);return}
const form=document.getElementById('bookingForm');if(form){form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;const d=Object.fromEntries(new FormData(form));const reg=T.regionMap[d.region];const city=cities.find(c=>c.region_id===reg&&c.name_ar===d.city);const svc=services.find(s=>s.name_ar===d.service);
if(!reg||!city)return notify('خطأ','المنطقة أو المدينة غير موجودة بقاعدة البيانات');if(!svc)return notify('الخدمة غير متاحة','الخدمة المختارة غير مفعّلة في قاعدة البيانات. اختر خدمة أخرى أو اطلب من الإدارة إضافتها: '+d.service);
const time=d.time; if(!/^\d{2}:\d{2}$/.test(time||''))return notify('خطأ','اختر وقت الزيارة من القائمة');const at=new Date(`${d.date}T${time}:00+03:00`);if(isNaN(at.getTime())||at<=new Date())return notify('خطأ','اختر موعدًا مستقبليًا بتوقيت السعودية');
T.say('جاري حفظ الحجز على Supabase...');const {data,error}=await sb.rpc('tr_create_booking',{p_name:d.name,p_phone:d.phone,p_service_id:svc.id,p_region_id:reg,p_city_id:city.id,p_scheduled_at:at.toISOString(),p_district:d.district||null,p_address:d.address||null,p_package:d.package||null,p_notes:[d.notes||'',`الخدمة المطلوبة: ${d.service}`,`الساعات: ${d.hours||''}`,`عدد العاملات: ${d.workers||''}`].filter(Boolean).join(' | ')});
if(error){T.say('فشل الحجز: '+error.message);notify('لم يتم حفظ الحجز',error.message+' — لم يتم إنشاء رقم حجز.');return}form.reset();if(typeof estimate==='function')estimate();await refresh();document.getElementById('trTrackNo').value=data.booking_no;document.getElementById('trTracking').scrollIntoView({behavior:'smooth',block:'start'});await trackBooking(data.booking_no);notify('تم تسجيل الحجز',`رقم الحجز ${data.booking_no} — احتفظ به لتتبع طلبك`)};}

// Track only the signed-in anonymous customer's own bookings. RLS enforces ownership.
const trackForm=document.getElementById('trTrackForm');
const trackResult=document.getElementById('trTrackResult');
const trackNav=document.getElementById('trTrackNav');
if(trackNav)trackNav.addEventListener('click',()=>document.getElementById('trTracking').scrollIntoView({behavior:'smooth',block:'start'}));
const safeTrack=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stages=['new','confirmed','scheduled','assigned','in_progress','completed'];
async function trackBooking(raw){
 const no=String(raw||'').trim().toUpperCase();
 if(!/^TR-[A-Z0-9-]{1,32}$/.test(no)){trackResult.innerHTML='<p class="tr-track-message">أدخل رقم حجز صحيحًا مثل TR-10000.</p>';return}
 trackResult.innerHTML='<p class="tr-track-message">جاري الاستعلام عن الحجز...</p>';
 try{
 const {data,error}=await sb.from('tr_bookings').select('booking_no,service_name_snapshot,scheduled_at,city_id,status,created_at').eq('booking_no',no).maybeSingle();
 if(error)throw error;
 if(!data){trackResult.innerHTML='<p class="tr-track-message">لم نعثر على هذا الحجز في حساب هذا المتصفح. تحقق من الرقم، أو استخدم نفس الجهاز الذي أجريت منه الحجز.</p>';return}
 const stage=stages.indexOf(data.status);const special=['cancelled','no_show','returned'].includes(data.status);
 const date=new Date(data.scheduled_at).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'});
 trackResult.innerHTML=`<div class="tr-track-card"><h3>الحجز ${safeTrack(data.booking_no)}</h3><div class="tr-track-meta"><div><small>الخدمة</small>${safeTrack(data.service_name_snapshot)}</div><div><small>الحالة الحالية</small>${safeTrack(T.statusMap[data.status]||data.status)}</div><div><small>موعد الزيارة بتوقيت السعودية</small>${safeTrack(date)}</div><div><small>رقم الحجز</small>${safeTrack(data.booking_no)}</div></div>${special?'<p class="tr-track-message">هذه الحالة تحتاج متابعة مع خدمة العملاء.</p>':`<div class="tr-track-steps">${stages.map((s,i)=>`<span class="tr-track-step ${i<=stage?'done':''}">${safeTrack(T.statusMap[s])}</span>`).join('')}</div>`}</div>`;
 }catch(e){trackResult.innerHTML='<p class="tr-track-message">تعذر تتبع الطلب الآن: '+safeTrack(e.message)+'</p>'}
}
if(trackForm)trackForm.addEventListener('submit',e=>{e.preventDefault();trackBooking(document.getElementById('trTrackNo').value)});

await refresh();setInterval(refresh,12000);
})();