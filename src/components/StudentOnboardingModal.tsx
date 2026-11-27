import React, { useState } from 'react';
import { UserCheck, ArrowRight, Phone, Calendar, Award, Users } from 'lucide-react';
import { StudentProfile } from '../types';

interface Props {
  onComplete: (
    profile: Omit<
      StudentProfile,
      'id' | 'total_attempted' | 'total_correct' | 'total_wrong' | 'total_time_seconds' | 'leaderboard_score'
    >
  ) => Promise<void>;
}

export const StudentOnboardingModal: React.FC<Props> = ({ onComplete }) => {
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [dob, setDob] = useState('');
  const [attemptStatus, setAttemptStatus] = useState<
    'Fresher (12th)' | '1st Drop' | '2nd Drop' | '3rd+ Drop' | ''
  >('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = fullName.trim().length >= 2 && gender !== '' && dob !== '' && attemptStatus !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onComplete({
        full_name: fullName.trim(),
        gender: gender as 'Male' | 'Female' | 'Other',
        dob,
        attempt_status: attemptStatus as 'Fresher (12th)' | '1st Drop' | '2nd Drop' | '3rd+ Drop',
        mobile_number: mobileNumber.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">DINU SARAN — Student Entry</h2>
            <p className="text-xs text-zinc-400">आगे बढ़ने के लिए अपनी जानकारी भरें</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
              पूरा नाम (Full Name) <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="अपना नाम लिखें..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              लिंग (Gender) <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Male', 'Female', 'Other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    gender === g
                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Calendar className="h-3.5 w-3.5 text-indigo-400" />
              जन्मतिथि (Date of Birth) <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Award className="h-3.5 w-3.5 text-indigo-400" />
              NEET अटेम्प्ट / ड्रॉप <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['Fresher (12th)', '1st Drop', '2nd Drop', '3rd+ Drop'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setAttemptStatus(status)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition ${
                    attemptStatus === status
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
              <Phone className="h-3.5 w-3.5 text-zinc-500" />
              मोबाइल नंबर (Optional)
            </label>
            <input
              type="tel"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="वैकल्पिक (छोड़ भी सकते हैं)"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!isValid || submitting}
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition ${
              isValid && !submitting
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-500'
                : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
            }`}
          >
            {submitting ? 'सेव हो रहा है...' : 'Next'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
