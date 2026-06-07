import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const sanitize = (val) => {
  if (typeof val !== 'string') return val;
  return val
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION|EXEC|CAST|CONVERT|XP_)\b/gi, '')
    .trim()
    .slice(0, 200);
};

const sanitizeNumber = (val, min = 0, max = 10000) => {
  const n = parseInt(val) || 0;
  return Math.max(min, Math.min(max, n));
};

export default function CalAIClone() {
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [tab, setTab] = useState('diary');
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [base64Ready, setBase64Ready] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [weeklyData, setWeeklyData] = useState(Array(7).fill(0));
  const [mealData, setMealData] = useState({ meal: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profile, setProfile] = useState({ gender: 'male', age: 25, weight: 70, height: 175, activity: '1.375' });

  const weekChartRef = useRef(null);
  const macroChartRef = useRef(null);
  const weekChartInstance = useRef(null);
  const macroChartInstance = useRef(null);

  const getDynamicGoals = () => {
    const w = parseFloat(profile.weight) || 70;
    const h = parseFloat(profile.height) || 175;
    const a = parseFloat(profile.age) || 25;
    const mult = parseFloat(profile.activity) || 1.375;
    let bmr = (10 * w) + (6.25 * h) - (5 * a);
    bmr = profile.gender === 'male' ? bmr + 5 : bmr - 161;
    const tdee = Math.round(bmr * mult);
    return {
      cal: tdee,
      pro: Math.round((tdee * 0.30) / 4),
      carb: Math.round((tdee * 0.40) / 4),
      fat: Math.round((tdee * 0.30) / 9),
    };
  };
  const GOALS = getDynamicGoals();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) { fetchProfile(); fetchTodayLogs(); fetchWeeklyData(); }
    else { setHistoryLogs([]); setWeeklyData(Array(7).fill(0)); }
  }, [user]);

  useEffect(() => {
    if (user && tab === 'progress') {
      const t = setTimeout(() => renderCharts(), 150);
      return () => clearTimeout(t);
    }
  }, [tab, historyLogs, weeklyData, user]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('*').eq('email', user.email).maybeSingle();
    if (data) setProfile({ gender: data.gender || 'male', age: data.age || 25, weight: data.weight || 70, height: data.height || 175, activity: data.activity || '1.375' });
  };

  const saveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    const { error } = await supabase.from('user_profiles').upsert({
      email: user.email,
      gender: profile.gender,
      age: sanitizeNumber(profile.age, 1, 120),
      weight: sanitizeNumber(profile.weight, 1, 500),
      height: sanitizeNumber(profile.height, 50, 300),
      activity: profile.activity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    setProfileSaving(false);
    if (error) alert('Failed to save: ' + error.message);
    else alert('✅ Profile saved and synced across all devices!');
  };

  const fetchTodayLogs = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('food_logs').select('*').eq('user_id', user.id).gte('created_at', today).order('created_at', { ascending: false });
    if (error) console.error('Fetch error:', error);
    if (data) setHistoryLogs(data);
  };

  const fetchWeeklyData = async () => {
    if (!user) return;
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const { data, error } = await supabase.from('food_logs').select('calories, created_at').eq('user_id', user.id).gte('created_at', dates[0]);
    if (error) return;
    const dayMap = {};
    dates.forEach(d => { dayMap[d] = 0; });
    (data || []).forEach(log => {
      const day = log.created_at.split('T')[0];
      if (dayMap[day] !== undefined) dayMap[day] += log.calories;
    });
    setWeeklyData(dates.map(d => dayMap[d]));
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return alert('Please fill in all fields');
    setAuthLoading(true);
    let error;
    if (authMode === 'signup') {
      const { error: err } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      error = err;
      if (!error) alert('Check your inbox for a confirmation link!');
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      error = err;
    }
    setAuthLoading(false);
    if (error) alert(error.message);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); setTab('diary'); };

  // ── KEY FIX: wait for FileReader to finish before enabling button ──────────
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBase64Ready(false);
    setBase64Data(null);
    setImagePreview(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result.split(',')[1];
      setBase64Data(b64);
      setBase64Ready(true); // only now enable the button
    };
    reader.readAsDataURL(file);
  };

  const clearSelectedImage = () => {
    setImagePreview(null);
    setBase64Data(null);
    setBase64Ready(false);
    setMealData({ meal: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
    // reset file input so same file can be re-selected
    const inp = document.getElementById('food-upload');
    if (inp) inp.value = '';
  };

  const analyzeImage = async () => {
    if (!base64Data || !base64Ready) {
      alert('Image is still loading, please wait a moment and try again.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/analyze-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ imageBase64: base64Data })
      });
      const responseText = await response.text();
      if (!response.ok) throw new Error(responseText);
      const parsed = JSON.parse(responseText);
      if (parsed.error) throw new Error(parsed.error);
      setMealData({
        meal: sanitize(parsed.meal || ''),
        calories: sanitizeNumber(parsed.calories, 0, 5000),
        protein: sanitizeNumber(parsed.protein, 0, 500),
        carbs: sanitizeNumber(parsed.carbs, 0, 500),
        fat: sanitizeNumber(parsed.fat, 0, 500),
      });
    } catch (err) {
      alert('Analysis failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const logMeal = async () => {
    if (!mealData.meal || !user) return;
    setLoading(true);
    const { error } = await supabase.from('food_logs').insert([{
      user_id: user.id,
      meal_name: sanitize(mealData.meal),
      calories: sanitizeNumber(mealData.calories, 0, 5000),
      protein: sanitizeNumber(mealData.protein, 0, 500),
      carbs: sanitizeNumber(mealData.carbs, 0, 500),
      fat: sanitizeNumber(mealData.fat, 0, 500),
    }]);
    setLoading(false);
    if (error) { alert('Database error: ' + error.message); return; }
    clearSelectedImage();
    fetchTodayLogs();
    fetchWeeklyData();
  };

  const deleteMeal = async (id) => {
    if (!window.confirm('Remove this meal?')) return;
    const { error } = await supabase.from('food_logs').delete().eq('id', id).eq('user_id', user.id);
    if (error) alert('Failed to delete: ' + error.message);
    else { fetchTodayLogs(); fetchWeeklyData(); }
  };

  const totals = historyLogs.reduce((a, l) => ({ cal: a.cal + l.calories, pro: a.pro + l.protein, carb: a.carb + l.carbs, fat: a.fat + l.fat }), { cal: 0, pro: 0, carb: 0, fat: 0 });

  const renderCharts = () => {
    if (weekChartInstance.current) weekChartInstance.current.destroy();
    if (macroChartInstance.current) macroChartInstance.current.destroy();
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en', { weekday: 'short' }));
    }
    if (weekChartRef.current) {
      weekChartInstance.current = new Chart(weekChartRef.current, {
        type: 'bar',
        data: { labels, datasets: [{ data: weeklyData, backgroundColor: weeklyData.map((_, i) => i === 6 ? '#639922' : '#C0DD97'), borderRadius: 6, borderSkipped: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } } } }
      });
    }
    if (macroChartRef.current) {
      const has = totals.pro > 0 || totals.carb > 0 || totals.fat > 0;
      macroChartInstance.current = new Chart(macroChartRef.current, {
        type: 'doughnut',
        data: { labels: ['Protein', 'Carbs', 'Fat'], datasets: [{ data: has ? [totals.pro, totals.carb, totals.fat] : [1, 1, 1], backgroundColor: has ? ['#A32D2D', '#534AB7', '#854F0B'] : ['#e0e0e0', '#e0e0e0', '#e0e0e0'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: has } } }
      });
    }
  };

  const s = {
    app: { maxWidth: 430, margin: '10px auto', background: '#f5f5f5', minHeight: '92vh', fontFamily: 'system-ui, -apple-system, sans-serif', border: '1px solid #e0e0e0', borderRadius: 40, boxShadow: '0 12px 36px rgba(0,0,0,0.12)', overflowX: 'hidden' },
    topbar: { background: '#fff', padding: '16px 20px 12px', borderBottom: '0.5px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    tabs: { display: 'flex', gap: 8, padding: '12px 16px', background: '#f5f5f5' },
    tab: (a) => ({ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '0.5px solid #ddd', cursor: 'pointer', background: a ? '#111' : '#fff', color: a ? '#fff' : '#666' }),
    section: { padding: '0 16px' },
    card: { background: '#fff', borderRadius: 12, border: '0.5px solid #eee', padding: 16, marginBottom: 12 },
    field: { marginBottom: 12 },
    lbl: { display: 'block', fontSize: 12, color: '#666', marginBottom: 5 },
    inp: { width: '100%', padding: '9px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: '#fafafa' },
    sel: { width: '100%', padding: '9px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: '#fafafa' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    pbar: { height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
    sgrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 12 },
  };

  const Ring = ({ pct, color, size, stroke }) => {
    const r = size === 'lg' ? 68 : 26;
    const c = 2 * Math.PI * r;
    const vb = size === 'lg' ? 160 : 64;
    const cx = vb / 2;
    return (
      <svg viewBox={`0 0 ${vb} ${vb}`} width={vb} height={vb}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#F1EFE8" strokeWidth={stroke} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - c * Math.min(pct || 0, 1)}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dashoffset 0.6s' }} />
      </svg>
    );
  };

  const streakDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    streakDays.push({ label: d.toLocaleDateString('en', { weekday: 'narrow' }), hasLog: weeklyData[6 - i] > 0, isToday: i === 0 });
  }

  if (!user) {
    return (
      <div style={s.app}>
        <div style={{ padding: '40px 24px 0', textAlign: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 10 }}>🥑 Cal AI</h2>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 30 }}>Track your macros instantly with AI</p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <input type="email" placeholder="Email Address" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={s.inp} />
            <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={s.inp} />
            <button type="submit" disabled={authLoading} style={{ width: '100%', padding: 14, background: '#111', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              {authLoading ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <p onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} style={{ color: '#007aff', fontSize: 13, marginTop: 20, cursor: 'pointer', fontWeight: 600 }}>
            {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Log In'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.app}>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>🥑 Cal AI</div>
          <span style={{ fontSize: 10, color: '#888' }}>{user.email}</span>
        </div>
        <button onClick={handleLogout} style={{ background: '#f5f5f5', border: '0.5px solid #ddd', borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer', color: '#555' }}>Logout</button>
      </div>

      <div style={s.tabs}>
        {['diary', 'progress', 'goals'].map(t => (
          <div key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {tab === 'diary' && (
        <div style={s.section}>
          <div style={s.card}>
            <div style={{ textAlign: 'center', padding: '10px 16px' }}>
              <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto 16px' }}>
                <Ring pct={totals.cal / GOALS.cal} color="#639922" size="lg" stroke={12} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 500, color: '#111' }}>{totals.cal}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>of {GOALS.cal} kcal</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#888' }}>{Math.max(GOALS.cal - totals.cal, 0)} kcal remaining</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 16 }}>
                {[
                  { key: 'pro', label: 'Protein', color: '#A32D2D', val: totals.pro, goal: GOALS.pro },
                  { key: 'carb', label: 'Carbs', color: '#534AB7', val: totals.carb, goal: GOALS.carb },
                  { key: 'fat', label: 'Fat', color: '#854F0B', val: totals.fat, goal: GOALS.fat },
                ].map(({ key, label, color, val, goal }) => (
                  <div key={key} style={{ textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 6px' }}>
                      <Ring pct={val / goal} color={color} size="sm" stroke={6} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 500, color }}>
                        {goal > 0 ? Math.round((val / goal) * 100) : 0}%
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{val}g / {goal}g</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <input type="file" accept="image/*" onChange={handleImageChange} id="food-upload" style={{ display: 'none' }} />

          {!imagePreview ? (
            <div style={{ border: '1px dashed #ccc', background: '#fafafa', borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}
              onClick={() => document.getElementById('food-upload').click()}>
              <div style={{ fontSize: 32, color: '#aaa', marginBottom: 8 }}>📸</div>
              <p style={{ fontSize: 14, color: '#888', margin: '0 0 4px' }}>Snap or upload a meal photo</p>
              <small style={{ fontSize: 12, color: '#bbb' }}>AI will instantly analyze calories and macros</small>
            </div>
          ) : (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12 }} />
              <button onClick={clearSelectedImage} style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}>×</button>
            </div>
          )}

          {imagePreview && (
            <button
              onClick={analyzeImage}
              disabled={loading || !base64Ready}
              style={{ width: '100%', padding: 13, background: loading ? '#aaa' : !base64Ready ? '#ccc' : '#52c41a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading || !base64Ready ? 'not-allowed' : 'pointer', marginBottom: 12 }}
            >
              {loading ? '⏳ Analyzing...' : !base64Ready ? '⏳ Loading image...' : '✨ Analyze with AI'}
            </button>
          )}

          <div style={s.card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 14px' }}>Meal details</h3>
            <div style={s.field}>
              <label style={s.lbl}>Meal name</label>
              <input style={s.inp} type="text" value={mealData.meal} onChange={e => setMealData({ ...mealData, meal: e.target.value })} placeholder="e.g. Grilled chicken salad" maxLength={200} />
            </div>
            <div style={s.grid2}>
              {[['calories','Calories (kcal)'],['protein','Protein (g)'],['carbs','Carbs (g)'],['fat','Fat (g)']].map(([k, lbl]) => (
                <div key={k} style={s.field}>
                  <label style={s.lbl}>{lbl}</label>
                  <input style={s.inp} type="number" min="0" max={k === 'calories' ? 5000 : 500} value={mealData[k] || ''} onChange={e => setMealData({ ...mealData, [k]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
            <button onClick={logMeal} disabled={!mealData.meal || loading}
              style={{ width: '100%', padding: 13, background: !mealData.meal || loading ? '#b7eb8f' : '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: !mealData.meal || loading ? 'not-allowed' : 'pointer', marginTop: 12 }}>
              {loading ? 'Saving...' : '💾 Log meal'}
            </button>
          </div>

          {historyLogs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 10, color: '#111' }}>Today's diary</div>
              {historyLogs.map(log => (
                <div key={log.id} style={{ background: '#fff', border: '0.5px solid #eee', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{log.meal_name}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>P: {log.protein}g · C: {log.carbs}g · F: {log.fat}g</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#185FA5' }}>{log.calories} kcal</div>
                    <button onClick={() => deleteMeal(log.id)} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: 16 }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'progress' && (
        <div style={s.section}>
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, color: '#111' }}>Weekly calories</div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>Real data — 0 means no meals logged that day</div>
            <div style={{ position: 'relative', height: 160 }}><canvas ref={weekChartRef} /></div>
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, color: '#111' }}>Today's macro split</div>
            {totals.pro === 0 && totals.carb === 0 && totals.fat === 0 && (
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Log meals today to see your macro breakdown</div>
            )}
            <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 12px' }}><canvas ref={macroChartRef} /></div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: '#888' }}>
              {[['#A32D2D','Protein',totals.pro],['#534AB7','Carbs',totals.carb],['#854F0B','Fat',totals.fat]].map(([c, l, v]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />{l}: {v}g
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'goals' && (
        <div style={s.section}>
          <div style={s.card}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: '#111' }}>🧬 Your Profile</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px' }}>Saved to your account — syncs across all devices</p>
            <div style={s.field}>
              <label style={s.lbl}>Biological Gender</label>
              <select style={s.sel} value={profile.gender} onChange={e => setProfile({ ...profile, gender: e.target.value })}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div style={s.grid2}>
              <div style={s.field}>
                <label style={s.lbl}>Age (years)</label>
                <input style={s.inp} type="number" min="1" max="120" value={profile.age} onChange={e => setProfile({ ...profile, age: parseInt(e.target.value) || 0 })} />
              </div>
              <div style={s.field}>
                <label style={s.lbl}>Height (cm)</label>
                <input style={s.inp} type="number" min="50" max="300" value={profile.height} onChange={e => setProfile({ ...profile, height: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div style={s.grid2}>
              <div style={s.field}>
                <label style={s.lbl}>Weight (kg)</label>
                <input style={s.inp} type="number" min="1" max="500" value={profile.weight} onChange={e => setProfile({ ...profile, weight: parseInt(e.target.value) || 0 })} />
              </div>
              <div style={s.field}>
                <label style={s.lbl}>Activity Level</label>
                <select style={s.sel} value={profile.activity} onChange={e => setProfile({ ...profile, activity: e.target.value })}>
                  <option value="1.2">Sedentary</option>
                  <option value="1.375">Lightly Active</option>
                  <option value="1.55">Moderately Active</option>
                  <option value="1.725">Very Active</option>
                </select>
              </div>
            </div>
            <button onClick={saveProfile} disabled={profileSaving}
              style={{ width: '100%', padding: 13, background: profileSaving ? '#b7eb8f' : '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              {profileSaving ? 'Saving...' : '💾 Save Profile to All Devices'}
            </button>
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 14, color: '#111' }}>Calculated Targets (BMR)</div>
            {[
              { label: 'Calories', val: totals.cal, goal: GOALS.cal, unit: 'kcal', color: '#639922' },
              { label: 'Protein', val: totals.pro, goal: GOALS.pro, unit: 'g', color: '#A32D2D' },
              { label: 'Carbs', val: totals.carb, goal: GOALS.carb, unit: 'g', color: '#534AB7' },
              { label: 'Fat', val: totals.fat, goal: GOALS.fat, unit: 'g', color: '#854F0B' },
            ].map(({ label, val, goal, unit, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{val} / {goal}{unit}</span>
                </div>
                <div style={s.pbar}>
                  <div style={{ height: '100%', width: Math.min((val / goal) * 100, 100) + '%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, color: '#111' }}>Streak tracker</div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Green = logged meals that day</div>
            <div style={s.sgrid}>
              {streakDays.map((d, i) => (
                <div key={i} style={{ aspectRatio: '1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, background: d.isToday ? '#fff' : d.hasLog ? '#3B6D11' : '#f0f0f0', color: d.isToday ? '#3B6D11' : d.hasLog ? '#EAF3DE' : '#aaa', border: d.isToday ? '1.5px solid #3B6D11' : 'none' }}>
                  {d.label}
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 24 }} />
        </div>
      )}
    </div>
  );
}