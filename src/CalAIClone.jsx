import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Initialize Supabase Client securely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GOALS = { cal: 2000, pro: 150, carb: 250, fat: 65 };
const WEEK_DATA = [1420, 1800, 1650, 2100, 1950, 1380];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalAIClone() {
  // Authentication State
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'

  // Application State
  const [tab, setTab] = useState('diary');
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [mealData, setMealData] = useState({ meal: '', calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Chart References
  const weekChartRef = useRef(null);
  const macroChartRef = useRef(null);
  const weekChartInstance = useRef(null);
  const macroChartInstance = useRef(null);

  // Monitor Supabase Authentication State Sessions
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch log history items specifically for the logged-in user
  useEffect(() => {
    if (user) {
      fetchTodayLogs();
    } else {
      setHistoryLogs([]);
    }
  }, [user]);

  // Re-trigger visual analytics calculations whenever the user adjusts tabs
  useEffect(() => {
    if (user && tab === 'progress') {
      const timer = setTimeout(() => renderCharts(), 100);
      return () => clearTimeout(timer);
    }
  }, [tab, historyLogs, user]);

  const fetchTodayLogs = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', user.id) // Secure user containment query isolation
      .gte('created_at', today)
      .order('created_at', { ascending: false });
    
    if (error) console.error('Fetch error:', error);
    if (data) setHistoryLogs(data);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return alert("Please fill in all fields");
    setAuthLoading(true);

    let error;
    if (authMode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      error = signUpError;
      if (!error) alert("Check your inbox for a registration confirmation link!");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      error = signInError;
    }

    setAuthLoading(false);
    if (error) alert(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setTab('diary');
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onloadend = () => setBase64Data(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  const clearSelectedImage = () => {
    setImagePreview(null);
    setBase64Data(null);
    setMealData({ meal: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  const analyzeImage = async () => {
    if (!base64Data) return;
    setLoading(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/analyze-food`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ imageBase64: base64Data })
      });
      if (!response.ok) { const e = await response.text(); throw new Error(e); }
      const parsed = await response.json();
      setMealData({
        meal: parsed.meal || '',
        calories: parseInt(parsed.calories) || 0,
        protein: parseInt(parsed.protein) || 0,
        carbs: parseInt(parsed.carbs) || 0,
        fat: parseInt(parsed.fat) || 0
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
      user_id: user.id, // Binds current log directly to the account UUID session
      meal_name: mealData.meal,
      calories: mealData.calories,
      protein: mealData.protein,
      carbs: mealData.carbs,
      fat: mealData.fat
    }]);
    setLoading(false);
    if (error) { alert('Database error: ' + error.message); return; }
    
    // Clear out input components smoothly on successful callback execution
    clearSelectedImage();
    fetchTodayLogs();
  };

  const totals = historyLogs.reduce((a, l) => ({
    cal: a.cal + l.calories,
    pro: a.pro + l.protein,
    carb: a.carb + l.carbs,
    fat: a.fat + l.fat
  }), { cal: 0, pro: 0, carb: 0, fat: 0 });

  const calPct = Math.min(totals.cal / GOALS.cal, 1);

  const renderCharts = () => {
    if (weekChartInstance.current) weekChartInstance.current.destroy();
    if (macroChartInstance.current) macroChartInstance.current.destroy();
    
    if (weekChartRef.current) {
      const weekData = [...WEEK_DATA, totals.cal];
      weekChartInstance.current = new Chart(weekChartRef.current, {
        type: 'bar',
        data: {
          labels: DAYS,
          datasets: [{
            data: weekData,
            backgroundColor: weekData.map((_, i) => i === 6 ? '#639922' : '#C0DD97'),
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } }
          }
        }
      });
    }
    if (macroChartRef.current) {
      macroChartInstance.current = new Chart(macroChartRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Protein', 'Carbs', 'Fat'],
          datasets: [{
            data: [totals.pro || 1, totals.carb || 1, totals.fat || 1],
            backgroundColor: ['#A32D2D', '#534AB7', '#854F0B'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '70%',
          plugins: { legend: { display: false } }
        }
      });
    }
  };

  // Micro UI Native CSS Definitions
  const s = {
    app: { maxWidth: 430, margin: '10px auto', background: '#f5f5f5', minHeight: '92vh', fontFamily: 'system-ui, -apple-system, sans-serif', border: '1px solid #e0e0e0', borderRadius: '40px', boxShadow: '0 12px 36px rgba(0,0,0,0.12)', overflowX: 'hidden', position: 'relative' },
    topbar: { background: '#fff', padding: '16px 20px 12px', borderBottom: '0.5px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    topbarTitle: { fontSize: 20, fontWeight: 800, color: '#111' },
    streakBadge: { display: 'flex', alignItems: 'center', gap: 6, background: '#FFF3E0', borderRadius: 20, padding: '5px 12px', cursor: 'pointer' },
    streakText: { fontSize: 11, fontWeight: 600, color: '#E65100' },
    tabs: { display: 'flex', gap: 8, padding: '12px 16px', background: '#f5f5f5' },
    tab: (active) => ({ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '0.5px solid #ddd', cursor: 'pointer', background: active ? '#111' : '#fff', color: active ? '#fff' : '#666' }),
    section: { padding: '0 16px' },
    card: { background: '#fff', borderRadius: 12, border: '0.5px solid #eee', padding: 16, marginBottom: 12 },
    calHero: { textAlign: 'center', padding: '10px 16px' },
    macroRings: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 },
    macroItem: { textAlign: 'center' },
    uploadCard: { border: '1px dashed #ccc', background: '#fafafa', borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer', marginBottom: 12 },
    analyzeBtn: (show) => ({ width: '100%', padding: 13, background: '#52c41a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: show ? 'block' : 'none', marginBottom: 12 }),
    field: { marginBottom: 12 },
    label: { display: 'block', fontSize: 12, color: '#666', marginBottom: 5 },
    input: { width: '100%', padding: '9px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: '#fafafa' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    logBtn: (disabled) => ({ width: '100%', padding: 13, background: disabled ? '#b7eb8f' : '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', marginTop: 12 }),
    logItem: { background: '#fff', border: '0.5px solid #eee', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    progressBar: { height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
    streakGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 12 },
  };

  const Ring = ({ pct, color, size, stroke, children }) => {
    const r = size === 'lg' ? 68 : 26;
    const circum = 2 * Math.PI * r;
    const vb = size === 'lg' ? 160 : 64;
    const cx = vb / 2;
    return (
      <svg viewBox={`0 0 ${vb} ${vb}`} width={vb} height={vb}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#F1EFE8" strokeWidth={stroke} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circum} strokeDashoffset={circum - circum * Math.min(pct, 1)}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dashoffset 0.6s' }} />
        {children}
      </svg>
    );
  };

  const streakDays = ['M','T','W','T','F','S','S'];
  const streakActive = [true,true,true,true,true,true,false];

  /* ------------------- VIEW A: AUTHENTICATION INTERFACE ------------------- */
  if (!user) {
    return (
      <div style={s.app}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px 40px', fontSize: '12px', fontWeight: '600' }}>
          <span>9:41</span><span>📶 🪫</span>
        </div>
        <div style={{ padding: '0 24px', textAlign: 'center', marginTop: '20px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '10px' }}>🥑 Cal AI</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '30px' }}>Track your macros instantly with AI</p>
          
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <input type="email" placeholder="Email Address" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} style={s.input} />
            <input type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} style={s.input} />
            <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '14px', background: '#111', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>
              {authLoading ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} style={{ color: '#007aff', fontSize: '13px', marginTop: '20px', cursor: 'pointer', fontWeight: '600' }}>
            {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Log In'}
          </p>
        </div>
      </div>
    );
  }

  /* ------------------- VIEW B: SECURE CORE INTERFACE ------------------- */
  return (
    <div style={s.app}>
      <div style={s.topbar}>
        <div>
          <div style={s.topbarTitle}>🥑 Cal AI</div>
          <span style={{ fontSize: '10px', color: '#888' }}>{user.email}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={s.streakBadge} onClick={handleLogout}>
            <span style={s.streakText}>Logout 🚪</span>
          </div>
        </div>
      </div>

      <div style={s.tabs}>
        {['diary','progress','goals'].map(t => (
          <div key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {/* DIARY TAB SUBSECTION */}
      {tab === 'diary' && (
        <div style={s.section}>
          <div style={s.card}>
            <div style={s.calHero}>
              <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto 16px' }}>
                <Ring pct={calPct} color="#639922" size="lg" stroke={12} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 500, color: '#111' }}>{totals.cal}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>of {GOALS.cal} kcal</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#888' }}>{Math.max(GOALS.cal - totals.cal, 0)} kcal remaining</div>

              <div style={s.macroRings}>
                {[
                  { key: 'pro', label: 'Protein', color: '#A32D2D', val: totals.pro, goal: GOALS.pro },
                  { key: 'carb', label: 'Carbs', color: '#534AB7', val: totals.carb, goal: GOALS.carb },
                  { key: 'fat', label: 'Fat', color: '#854F0B', val: totals.fat, goal: GOALS.fat },
                ].map(({ key, label, color, val, goal }) => (
                  <div key={key} style={s.macroItem}>
                    <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 6px' }}>
                      <Ring pct={val / goal} color={color} size="sm" stroke={6} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 500, color }}>
                        {goal > 0 ? Math.round((val / goal) * 100) : 0}%
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{val}g</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <input type="file" accept="image/*" onChange={handleImageChange} id="food-upload" style={{ display: 'none' }} />
          
          {!imagePreview ? (
            <div style={s.uploadCard} onClick={() => document.getElementById('food-upload').click()}>
              <div style={{ fontSize: 32, color: '#aaa', marginBottom: 8 }}>📸</div>
              <p style={{ fontSize: 14, color: '#888', margin: '0 0 4px 0' }}>Snap or upload a meal photo</p>
              <small style={{ fontSize: 12, color: '#bbb' }}>AI will instantly analyze calories and macros</small>
            </div>
          ) : (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12 }} />
              {/* Clean absolute contextual layout for the close sign button configuration */}
              <button onClick={clearSelectedImage} style={{
                position: 'absolute', top: '10px', right: '10px', width: '30px', height: '30px',
                borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
                fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', lineHeight: 1
              }}>×</button>
            </div>
          )}

          <button style={s.analyzeBtn(!!base64Data)} onClick={analyzeImage} disabled={loading}>
            {loading ? '⏳ Analyzing Elements...' : '✨ Analyze with AI'}
          </button>

          <div style={s.card}>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: '0 0 14px 0' }}>Meal details</h3>
            <div style={s.field}>
              <label style={s.label}>Meal name</label>
              <input style={s.input} type="text" value={mealData.meal} onChange={e => setMealData({ ...mealData, meal: e.target.value })} placeholder="e.g. Grilled chicken salad" />
            </div>
            <div style={s.grid2}>
              {[
                ['calories', 'Calories (kcal)'],
                ['protein', 'Protein (g)'],
                ['carbs', 'Carbs (g)'],
                ['fat', 'Fat (g)']
              ].map(([k, lbl]) => (
                <div key={k} style={s.field}>
                  <label style={s.label}>{lbl}</label>
                  <input style={s.input} type="number" value={mealData[k] || ''} onChange={e => setMealData({ ...mealData, [k]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
            <button style={s.logBtn(!mealData.meal || loading)} onClick={logMeal} disabled={!mealData.meal || loading}>
              {loading ? 'Saving...' : '💾 Log meal'}
            </button>
          </div>

          {historyLogs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 10, color: '#111' }}>Today's diary</div>
              {historyLogs.map(log => (
                <div key={log.id} style={s.logItem}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{log.meal_name}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>P: {log.protein}g · C: {log.carbs}g · F: {log.fat}g</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#185FA5' }}>{log.calories} kcal</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROGRESS TAB SUBSECTION */}
      {tab === 'progress' && (
        <div style={s.section}>
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12, color: '#111' }}>Weekly calories</div>
            <div style={{ position: 'relative', height: 160 }}>
              <canvas ref={weekChartRef} role="img" aria-label="Weekly calorie bar chart" />
            </div>
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12, color: '#111' }}>Macro breakdown</div>
            <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 12px' }}>
              <canvas ref={macroChartRef} role="img" aria-label="Macro donut chart" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: '#888' }}>
              {[
                ['#A32D2D', 'Protein'],
                ['#534AB7', 'Carbs'],
                ['#854F0B', 'Fat']
              ].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GOALS TAB SUBSECTION */}
      {tab === 'goals' && (
        <div style={s.section}>
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 14, color: '#111' }}>Daily targets</div>
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
                <div style={s.progressBar}>
                  <div style={{ height: '100%', width: Math.min((val / goal) * 100, 100) + '%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, color: '#111' }}>Streak tracker</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Last 7 days</div>
            <div style={s.streakGrid}>
              {streakDays.map((d, i) => (
                <div key={i} style={{
                  aspectRatio: '1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 500,
                  background: i === 5 ? '#fff' : streakActive[i] ? '#3B6D11' : '#f0f0f0',
                  color: i === 5 ? '#3B6D11' : streakActive[i] ? '#EAF3DE' : '#aaa',
                  border: i === 5 ? '1.5px solid #3B6D11' : 'none'
                }}>{d}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}