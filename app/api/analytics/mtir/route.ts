import { NextResponse } from 'next/server';
import { queryD1, isCloudflareApiConfigured } from '../../../../lib/cloudflare';
import { requireAuth } from '../../../../lib/authGuard';

// Helper to generate UUID if not provided by client
const generateUUID = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15);
};

// Self-healing table SQL
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS mtir_simulation_logs (
    id TEXT PRIMARY KEY,
    study_arm TEXT,
    session_id TEXT,
    registrar_role TEXT,
    task_id TEXT,
    search_query TEXT,
    time_taken_ms INTEGER,
    is_successful INTEGER,
    accuracy_score REAL,
    connection_status TEXT,
    device_platform TEXT,
    query_count INTEGER,
    incorrect_opens INTEGER,
    created_at TEXT
  );
`;

// GET Handler - Returns aggregated statistics
export async function GET(req: Request) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!isCloudflareApiConfigured) {
      console.warn("Cloudflare D1 not configured. Returning mock study metrics for UI development.");
      return NextResponse.json({
        success: true,
        mock: true,
        stats: getMockStats()
      });
    }

    // Initialize table if not exists
    await queryD1(CREATE_TABLE_SQL);

    // Fetch all logs
    const result = await queryD1(`SELECT * FROM mtir_simulation_logs ORDER BY created_at DESC`);
    if (!result.success) {
      throw new Error(`Failed to query D1: ${result.error}`);
    }

    const logs = result.results || [];

    // If no logs, return baseline mock stats or zeroed stats
    if (logs.length === 0) {
      return NextResponse.json({
        success: true,
        stats: {
          totalBaseline: 0,
          totalApp: 0,
          avgBaselineTimeSec: 0,
          avgAppTimeSec: 0,
          baselineSuccessRate: 0,
          appSuccessRate: 0,
          speedupFactor: 0,
          avgQueries: 0,
          avgOpens: 0,
          roleBreakdown: [],
          recentLogs: []
        }
      });
    }

    // Process logs in JS for speed and simplicity
    const baselineLogs = logs.filter(l => l.study_arm === 'baseline');
    const appLogs = logs.filter(l => l.study_arm === 'intervention');

    const totalBaseline = baselineLogs.length;
    const totalApp = appLogs.length;

    const sumBaselineTime = baselineLogs.reduce((sum, l) => sum + (l.time_taken_ms || 0), 0);
    const sumAppTime = appLogs.reduce((sum, l) => sum + (l.time_taken_ms || 0), 0);

    const avgBaselineTimeSec = totalBaseline > 0 ? (sumBaselineTime / totalBaseline / 1000) : 0;
    const avgAppTimeSec = totalApp > 0 ? (sumAppTime / totalApp / 1000) : 0;

    const baselineSuccesses = baselineLogs.filter(l => l.is_successful === 1).length;
    const appSuccesses = appLogs.filter(l => l.is_successful === 1).length;

    const baselineSuccessRate = totalBaseline > 0 ? (baselineSuccesses / totalBaseline) * 100 : 0;
    const appSuccessRate = totalApp > 0 ? (appSuccesses / totalApp) * 100 : 0;

    const speedupFactor = avgAppTimeSec > 0 ? (avgBaselineTimeSec / avgAppTimeSec) : 0;

    const totalQueries = appLogs.reduce((sum, l) => sum + (l.query_count || 0), 0);
    const totalOpens = appLogs.reduce((sum, l) => sum + (l.incorrect_opens || 0), 0);
    const avgQueries = totalApp > 0 ? (totalQueries / totalApp) : 0;
    const avgOpens = totalApp > 0 ? (totalOpens / totalApp) : 0;

    // Segmented by Role
    const roles = Array.from(new Set(logs.map(l => l.registrar_role || 'Unknown')));
    const roleBreakdown = roles.map(role => {
      const roleBaseline = baselineLogs.filter(l => l.registrar_role === role);
      const roleApp = appLogs.filter(l => l.registrar_role === role);

      const rBaseAvg = roleBaseline.length > 0 
        ? (roleBaseline.reduce((sum, l) => sum + l.time_taken_ms, 0) / roleBaseline.length / 1000) 
        : 0;

      const rAppAvg = roleApp.length > 0 
        ? (roleApp.reduce((sum, l) => sum + l.time_taken_ms, 0) / roleApp.length / 1000) 
        : 0;

      return {
        role,
        baselineCount: roleBaseline.length,
        appCount: roleApp.length,
        avgBaselineSec: rBaseAvg,
        avgAppSec: rAppAvg,
        speedup: rAppAvg > 0 ? (rBaseAvg / rAppAvg) : 0
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalBaseline,
        totalApp,
        avgBaselineTimeSec: parseFloat(avgBaselineTimeSec.toFixed(2)),
        avgAppTimeSec: parseFloat(avgAppTimeSec.toFixed(2)),
        baselineSuccessRate: parseFloat(baselineSuccessRate.toFixed(1)),
        appSuccessRate: parseFloat(appSuccessRate.toFixed(1)),
        speedupFactor: parseFloat(speedupFactor.toFixed(1)),
        avgQueries: parseFloat(avgQueries.toFixed(1)),
        avgOpens: parseFloat(avgOpens.toFixed(1)),
        roleBreakdown,
        recentLogs: logs.slice(0, 15) // Return last 15 trials
      }
    });

  } catch (err: any) {
    console.error("MTIR API GET Error:", err);
    return NextResponse.json({ error: 'Failed to retrieve stats.' }, { status: 500 });
  }
}

// POST Handler - Logs a simulation run
export async function POST(req: Request) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const payload = await req.json();
    const {
      study_arm, // 'baseline' or 'intervention'
      session_id,
      registrar_role,
      task_id,
      search_query = null,
      time_taken_ms,
      is_successful, // 1 or 0
      accuracy_score = 1.0,
      connection_status = 'online',
      device_platform = 'mobile',
      query_count = 0,
      incorrect_opens = 0
    } = payload;

    // Validation
    if (!study_arm || !['baseline', 'intervention'].includes(study_arm)) {
      return NextResponse.json({ error: "Invalid study_arm. Must be 'baseline' or 'intervention'." }, { status: 400 });
    }
    if (!task_id) {
      return NextResponse.json({ error: "task_id is required." }, { status: 400 });
    }
    if (typeof time_taken_ms !== 'number' || time_taken_ms < 0) {
      return NextResponse.json({ error: "time_taken_ms must be a non-negative number." }, { status: 400 });
    }

    const logId = generateUUID();
    const sessionId = session_id || generateUUID();
    const isSuccessful = is_successful ? 1 : 0;
    const createdAt = new Date().toISOString();
    const role = registrar_role || 'ST4';

    if (!isCloudflareApiConfigured) {
      console.warn("Cloudflare D1 is not configured. Logging MTIR event to console:");
      console.log(JSON.stringify({ id: logId, study_arm, session_id: sessionId, registrar_role: role, task_id, time_taken_ms, isSuccessful, createdAt }, null, 2));
      return NextResponse.json({
        success: true,
        message: "Logged to console (Mock/Dev mode)",
        mock: true,
        log: { id: logId, study_arm, session_id: sessionId, registrar_role: role, task_id, time_taken_ms, isSuccessful, createdAt }
      });
    }

    // Save to D1
    await queryD1(CREATE_TABLE_SQL);
    const result = await queryD1(
      `INSERT INTO mtir_simulation_logs (
        id, study_arm, session_id, registrar_role, task_id, search_query, 
        time_taken_ms, is_successful, accuracy_score, connection_status, 
        device_platform, query_count, incorrect_opens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        logId, study_arm, sessionId, role, task_id, search_query,
        time_taken_ms, isSuccessful, accuracy_score, connection_status,
        device_platform, query_count, incorrect_opens, createdAt
      ]
    );

    if (!result.success) {
      throw new Error(`D1 Database insertion failed: ${result.error}`);
    }

    return NextResponse.json({ success: true, message: "MTIR run logged successfully." });

  } catch (err: any) {
    console.error("MTIR API POST Error:", err);
    return NextResponse.json({ error: 'Failed to save MTIR log.' }, { status: 500 });
  }
}

// Generate realistic mock study metrics for dev preview
function getMockStats() {
  return {
    totalBaseline: 24,
    totalApp: 28,
    avgBaselineTimeSec: 168.4,
    avgAppTimeSec: 2.15,
    baselineSuccessRate: 79.2,
    appSuccessRate: 100.0,
    speedupFactor: 78.3,
    avgQueries: 1.2,
    avgOpens: 0.1,
    roleBreakdown: [
      { role: 'ST3', baselineCount: 6, appCount: 7, avgBaselineSec: 195.2, avgAppSec: 2.8, speedup: 69.7 },
      { role: 'ST4', baselineCount: 8, appCount: 10, avgBaselineSec: 172.5, avgAppSec: 2.1, speedup: 82.1 },
      { role: 'ST5-7', baselineCount: 7, appCount: 8, avgBaselineSec: 154.0, avgAppSec: 1.8, speedup: 85.6 },
      { role: 'Consultant', baselineCount: 3, appCount: 3, avgBaselineSec: 122.3, avgAppSec: 1.6, speedup: 76.4 }
    ],
    recentLogs: [
      { id: '1', study_arm: 'intervention', registrar_role: 'ST4', task_id: 'la-toxicity', time_taken_ms: 2200, is_successful: 1, created_at: new Date(Date.now() - 3600000).toISOString() },
      { id: '2', study_arm: 'baseline', registrar_role: 'ST3', task_id: 'la-toxicity', time_taken_ms: 184000, is_successful: 1, created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: '3', study_arm: 'intervention', registrar_role: 'ST5-7', task_id: 'dexmed-dosing', time_taken_ms: 1800, is_successful: 1, created_at: new Date(Date.now() - 10800000).toISOString() },
      { id: '4', study_arm: 'baseline', registrar_role: 'ST4', task_id: 'dexmed-dosing', time_taken_ms: 142000, is_successful: 0, created_at: new Date(Date.now() - 14400000).toISOString() }
    ]
  };
}
