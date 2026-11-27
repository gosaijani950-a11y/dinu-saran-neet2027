import React, { useEffect, useState } from 'react';
import { Trophy, ArrowLeft, Target, Clock, CheckCircle2, Medal } from 'lucide-react';
import { StudentProfile } from '../types';

interface Props {
  currentStudentId?: string;
  fetchLeaderboard: () => Promise<StudentProfile[]>;
  onBack: () => void;
}

export const LeaderboardView: React.FC<Props> = ({ currentStudentId, fetchLeaderboard, onBack }) => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then((list) => setStudents(list))
      .finally(() => setLoading(false));
  }, [fetchLeaderboard]);

  const myIndex = students.findIndex((s) => s.id === currentStudentId);
  const myProfile = myIndex >= 0 ? students[myIndex] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-16">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </button>
        <div className="flex items-center gap-2 text-amber-400">
          <Trophy className="h-5 w-5" />
          <h1 className="text-base font-bold text-white">NEET 2027 Leaderboard</h1>
        </div>
        <div className="w-16" />
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-zinc-900 to-indigo-500/10 p-4 text-xs text-zinc-300">
        रैंकिंग का आधार: <span className="font-semibold text-amber-300">Accuracy %</span> +{' '}
        <span className="font-semibold text-emerald-300">Attempted Questions</span> +{' '}
        <span className="font-semibold text-sky-300">Speed (कम समय)</span>
      </div>

      {myProfile && (
        <div className="flex items-center justify-between rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">आपकी वर्तमान रैंक</span>
            <p className="text-base font-bold text-white">
              #{myIndex + 1} • {myProfile.full_name}
            </p>
            <p className="text-xs text-zinc-400">
              {myProfile.attempt_status} • {myProfile.total_attempted} प्रश्न हल किए
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-indigo-300">{Math.round(myProfile.leaderboard_score)} pts</div>
            <div className="text-xs text-emerald-400">
              {myProfile.total_attempted > 0
                ? Math.round((myProfile.total_correct / myProfile.total_attempted) * 100)
                : 0}
              % Accuracy
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-400">लीडरबोर्ड लोड हो रहा है...</div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
          अभी तक किसी ने टेस्ट हल नहीं किया है। पहले टेस्ट देकर टॉप #1 बनें!
        </div>
      ) : (
        <div className="space-y-2.5">
          {students.slice(0, 50).map((s, idx) => {
            const accuracy = s.total_attempted > 0 ? Math.round((s.total_correct / s.total_attempted) * 100) : 0;
            const avgSec = s.total_attempted > 0 ? Math.round(s.total_time_seconds / s.total_attempted) : 0;
            const isMe = s.id === currentStudentId;

            return (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                  isMe
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : idx < 3
                    ? 'border-amber-500/30 bg-zinc-900'
                    : 'border-zinc-800/80 bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold ${
                      idx === 0
                        ? 'bg-amber-400 text-zinc-950'
                        : idx === 1
                        ? 'bg-zinc-300 text-zinc-950'
                        : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {idx < 3 ? <Medal className="h-4 w-4" /> : `#${idx + 1}`}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{s.full_name}</span>
                      <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {s.attempt_status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Target className="h-3 w-3" /> {accuracy}%
                      </span>
                      <span className="flex items-center gap-1 text-sky-400">
                        <CheckCircle2 className="h-3 w-3" /> {s.total_attempted} Qs
                      </span>
                      <span className="flex items-center gap-1 text-amber-300">
                        <Clock className="h-3 w-3" /> {avgSec}s/Q
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-extrabold text-white">{Math.round(s.leaderboard_score)}</div>
                  <div className="text-[10px] text-zinc-500">SCORE</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
