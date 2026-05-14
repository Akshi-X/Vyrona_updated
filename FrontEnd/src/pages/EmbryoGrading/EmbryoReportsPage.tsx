import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import mGScaleLogo from '../../assets/mGScale.svg';
import { ivfService, type IvfCycle, type IvfCycleLog, type IvfCycleWithLogs } from '../../services/ivfService';

const fmt = (v: string | number | null | undefined): string => v != null ? String(v) : '—';

const parseD3 = (g: string | null) => {
  if (!g) return { cells: '—', frag: '—' };
  const m = g.match(/^(\d+)C(\d+)$/);
  return m ? { cells: m[1], frag: m[2] } : { cells: g, frag: '—' };
};

const gradeChip = (grade: string | null, day: 'd3' | 'd5' | 'd6') => {
  if (!grade || grade === '—') return <span className="text-gray-300 text-xs">—</span>;
  if (day === 'd3') {
    return (
      <span className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold bg-primary-bg text-primary">
        {grade}
      </span>
    );
  }
  const icmTe = grade.slice(1);
  const cls = icmTe === 'AA'
    ? 'bg-green-100 text-green-700'
    : icmTe === 'BB'
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-amber-100 text-amber-700';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      {grade}
    </span>
  );
};

const fateChip = (fate: string | null) => {
  if (!fate) return <span className="text-gray-300 text-xs">—</span>;
  const map: Record<string, string> = {
    Frozen: 'bg-blue-100 text-blue-700',
    Transferred: 'bg-green-100 text-green-700',
    Discarded: 'bg-red-100 text-red-700',
    Biopsied: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${map[fate] ?? 'bg-gray-100 text-gray-600'}`}>
      {fate}
    </span>
  );
};

export default function EmbryoReportsPage() {
  const { his } = useParams<{ his: string }>();
  const detailHis = his?.trim().toUpperCase() ?? '';

  const [cycle, setCycle] = useState<IvfCycleWithLogs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ivfService.listCycles({ his_id: detailHis }).then(async (cycles: IvfCycle[]) => {
      const matched = cycles.find(c => c.his_id.toUpperCase() === detailHis);
      if (cancelled) return;
      if (!matched) { setLoading(false); return; }
      const full = await ivfService.getCycleWithLogs(matched.cycle_id);
      if (!cancelled) { setCycle(full); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [detailHis]);

  const logs: IvfCycleLog[] = cycle?.logs ?? [];

  const stats = {
    totalOocytes: logs.length,
    fertilised: logs.filter(l => l.d1_pn && l.d1_pn !== '0PN').length,
    day3: logs.filter(l => l.d3_grade).length,
    day5: logs.filter(l => l.d5_grade).length,
    day6: logs.filter(l => l.d6_grade).length,
    frozen: logs.filter(l => l.fate === 'Frozen').length,
  };

  const printDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <>
      {/* ── Report (printed) ───────────────────────────────────────── */}
      <div id="embryo-report-print">

        {/* Header */}
        <div className="flex items-stretch mb-6 rounded-xl overflow-hidden border border-line">
          <div className="flex items-center justify-center bg-primary px-6 py-4 shrink-0">
            <img src={mGScaleLogo} alt="mG-SCALE" className="h-10 w-auto" />
          </div>
          <div className="flex items-center justify-between flex-1 px-6 py-4 bg-white">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Embryology Lab Report</h1>
              <p className="text-xs text-gray-500 mt-0.5">HIS: {detailHis || '—'}</p>
            </div>
            <div className="text-right text-xs text-gray-400">
              <p>Generated: {printDate}</p>
              {cycle?.opu_date && (
                <p className="mt-0.5">OPU Date: {new Date(cycle.opu_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading report…</div>
        ) : !cycle ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">No cycle found for HIS {detailHis}.</div>
        ) : (
          <>
            {/* Patient & Cycle Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-surface border border-line-light rounded-xl p-4">
                <p className="text-[10px] font-semibold text-[#8A7892] uppercase tracking-widest mb-2">Patient Info</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <Row label="Patient Name" value={fmt(cycle.patient_name)} />
                  <Row label="HIS ID" value={fmt(cycle.his_id)} />
                  <Row label="OPU Date" value={cycle.opu_date ? new Date(cycle.opu_date).toLocaleDateString('en-GB') : '—'} />
                  <Row label="Status" value={fmt(cycle.status)} />
                </div>
              </div>
              <div className="bg-surface border border-line-light rounded-xl p-4">
                <p className="text-[10px] font-semibold text-[#8A7892] uppercase tracking-widest mb-2">Cycle Details</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <Row label="Cycle Type" value={fmt(cycle.cycle_type)} />
                  <Row label="Injection Method" value={fmt(cycle.injection_method)} />
                  <Row label="Sperm Quality" value={fmt(cycle.sperm_quality)} />
                  <Row label="Oocyte Quality" value={fmt(cycle.oocyte_quality)} />
                </div>
              </div>
            </div>

            {/* Oocyte Count */}
            <div className="bg-surface border border-line-light rounded-xl p-4 mb-6">
              <p className="text-[10px] font-semibold text-[#8A7892] uppercase tracking-widest mb-3">Oocyte Count</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'MII (Mature)', value: cycle.oocyte_m2 },
                  { label: 'MI', value: cycle.oocyte_m1 },
                  { label: 'GV', value: cycle.oocyte_gv },
                  { label: 'Others', value: cycle.oocyte_others },
                ].map(s => (
                  <div key={s.label} className="text-center bg-white rounded-lg border border-line py-3 px-2">
                    <p className="text-xl font-bold text-primary">{s.value ?? '—'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Outcome Summary */}
            <div className="grid grid-cols-6 gap-3 mb-6">
              {[
                { label: 'Total Embryos', value: stats.totalOocytes },
                { label: 'Fertilised', value: stats.fertilised },
                { label: 'Day 3', value: stats.day3 },
                { label: 'Day 5 Blast', value: stats.day5 },
                { label: 'Day 6 Blast', value: stats.day6 },
                { label: 'Frozen', value: stats.frozen },
              ].map(s => (
                <div key={s.label} className="bg-white border border-line rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{s.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Embryo Log Table */}
            {logs.length > 0 && (
              <div className="border border-line rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-surface border-b border-line">
                  <h2 className="text-sm font-semibold text-gray-800">Embryo Development Log</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-line">
                        <Th>#</Th>
                        <Th>D0 Maturity</Th>
                        <Th>D0 Drop</Th>
                        <Th>D1 PN</Th>
                        <Th>D1 Zygote</Th>
                        <Th>D3 Drop</Th>
                        <Th>D3 Grade</Th>
                        <Th>D5 Stage</Th>
                        <Th>D5 Grade</Th>
                        <Th>D6 Stage</Th>
                        <Th>D6 Grade</Th>
                        <Th>Fate</Th>
                        <Th>FZ#</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log, idx) => {
                        const d3 = parseD3(log.d3_grade);
                        return (
                          <tr key={log.log_id} className={`border-b border-line-light ${idx % 2 === 0 ? 'bg-white' : 'bg-surface'}`}>
                            <Td>{log.oocyte_no}</Td>
                            <Td>{fmt(log.d0_maturity)}</Td>
                            <Td>{fmt(log.d0_drop_no)}</Td>
                            <Td>{fmt(log.d1_pn)}</Td>
                            <Td>{fmt(log.d1_zygote_status)}</Td>
                            <Td>{fmt(log.d3_drop_no)}</Td>
                            <Td>{gradeChip(d3.cells !== '—' ? `${d3.cells}C${d3.frag}` : null, 'd3')}</Td>
                            <Td>{fmt(log.d5_stage)}</Td>
                            <Td>{gradeChip(log.d5_grade, 'd5')}</Td>
                            <Td>{fmt(log.d6_stage)}</Td>
                            <Td>{gradeChip(log.d6_grade, 'd6')}</Td>
                            <Td>{fateChip(log.fate)}</Td>
                            <Td>{fmt(log.freeze_no)}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {logs.length === 0 && (
              <div className="flex items-center justify-center py-10 text-sm text-gray-400 border border-dashed border-line rounded-xl">
                No embryo logs recorded for this cycle.
              </div>
            )}
          </>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #embryo-report-print,
          #embryo-report-print * { visibility: visible; }
          #embryo-report-print { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; }
        }
      `}</style>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
      {children}
    </td>
  );
}
