import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';

interface BoundaryState {
  hasError: boolean;
}

export class GlobalSafeErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Safe Boundary Caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-10 max-w-md rounded-3xl border border-amber-500/40 bg-slate-900 p-6 text-center text-white shadow-2xl space-y-4">
          <AlertTriangle className="mx-auto h-11 w-11 text-amber-400" />
          <h3 className="text-base font-extrabold">कुछ तकनीकी रुकावट आई है</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            चिंता न करें, आपका सारा डेटा लोकल वॉल्ट में सुरक्षित है। किसी भी सहायता के लिए संपर्क करें:
          </p>
          <a
            href="https://wa.me/23379778524"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-500"
          >
            <MessageCircle className="w-4 h-4" /> Contact on WhatsApp: +233 79778524
          </a>
          <p className="text-[11px] font-semibold text-amber-300">We will fix it soon!</p>
          <div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-indigo-500"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SUB_DIGITS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

const SUP_CHARS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾', 'n': 'ⁿ',
};

export const formatNeetExamText = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/\*\*/g, '')
    .replace(/<->/g, '⇌')
    .replace(/->/g, '→')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/\+-/g, '±')
    .replace(/\\times|\*/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\degree|\^o\b/g, '°')
    .replace(/\\Omega/g, 'Ω')
    .replace(/\\mu/g, 'μ')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\^\{([0-9+\-()n]+)\}/g, (_, grp) =>
      grp.split('').map((c: string) => SUP_CHARS[c] || c).join('')
    )
    .replace(/\^([0-9+\-n]+)/g, (_, grp) =>
      grp.split('').map((c: string) => SUP_CHARS[c] || c).join('')
    )
    .replace(/([A-Z][a-z]?)(\d+)(?=[A-Z0-9()+\-−\s,.;:!?]|$)/g, (_, el, nums) => {
      const sub = nums.split('').map((d: string) => SUB_DIGITS[d] || d).join('');
      return `${el}${sub}`;
    });
};

export interface HindiNeetPyq {
  subject: 'Physics' | 'Chemistry' | 'Biology';
  question: string;
  options: string[];
  correctIndex: number;
}

export const HINDI_NEET_PYQ_BANK: HindiNeetPyq[] = [
  {
    subject: 'Biology',
    question: '[NEET PYQ] डीएनए प्रतिकृति (DNA Replication) के दौरान ओकाज़ाकी खंडों (Okazaki fragments) को जोड़ने वाला एंजाइम कौन-सा है?',
    options: ['डीएनए पॉलीमरेज़ I (DNA Polymerase I)', 'डीएनए लाइगेज (DNA Ligase)', 'हेलीकेज़ (Helicase)', 'प्राइमेज़ (Primase)'],
    correctIndex: 1,
  },
  {
    subject: 'Biology',
    question: '[NEET PYQ] क्रैंज शारीरिकी (Kranz anatomy) निम्नलिखित में से किस प्रकार के पौधों की पत्तियों की प्रमुख विशेषता है?',
    options: ['C₃ पौधे (C₃ plants)', 'C₄ पौधे (C₄ plants)', 'CAM पौधे (CAM plants)', 'जलोद्भिद (Hydrophytes)'],
    correctIndex: 1,
  },
  {
    subject: 'Biology',
    question: '[NEET PYQ] मानव वृक्क (Kidney) में जल के पुनरावशोषण (Reabsorption) को नियंत्रित करने वाला मुख्य हार्मोन कौन-सा है?',
    options: ['ऑक्सीटोसिन (Oxytocin)', 'वैसोप्रेसिन / एडीएच (Vasopressin / ADH)', 'प्रोलैक्टिन (Prolactin)', 'थायरॉक्सिन (Thyroxine)'],
    correctIndex: 1,
  },
  {
    subject: 'Chemistry',
    question: '[NEET PYQ] निम्नलिखित यौगिकों में से किसकी अम्लीय प्रबलता (Acidic strength) सबसे अधिक होती है?',
    options: ['पैरा-नाइट्रोफ़ीनॉल (p-Nitrophenol)', 'पैरा-क्रेसॉल (p-Cresol)', 'फ़ीनॉल (Phenol)', 'एथेनॉल (Ethanol)'],
    correctIndex: 0,
  },
  {
    subject: 'Chemistry',
    question: '[NEET PYQ] ज़ेनॉन टेट्राफ़्लोराइड (XeF₄) अणु में केंद्रीय परमाणु का संकरण (Hybridization) क्या होता है?',
    options: ['sp³', 'sp³d', 'sp³d²', 'dsp²'],
    correctIndex: 2,
  },
  {
    subject: 'Chemistry',
    question: '[NEET PYQ] प्रथम कोटि की अभिक्रिया (First-order reaction) के लिए अर्ध-आयु काल (t₁/₂) का सही सूत्र क्या है?',
    options: ['0.693 / k', '2.303 / k', 'k / 0.693', 'a₀ / 2k'],
    correctIndex: 0,
  },
  {
    subject: 'Physics',
    question: '[NEET PYQ] प्लांक नियतांक (Planck’s constant, h) का विमीय सूत्र (Dimensional formula) किस भौतिक राशि के समान होता है?',
    options: ['रेखीय संवेग (Linear momentum)', 'कोणीय संवेग (Angular momentum)', 'बल आघूर्ण (Torque)', 'शक्ति (Power)'],
    correctIndex: 1,
  },
  {
    subject: 'Physics',
    question: '[NEET PYQ] पृथ्वी से पलायन वेग (Escape velocity) 11.2 km/s है। यदि किसी ग्रह का द्रव्यमान 2M और त्रिज्या 2R हो, तो उस ग्रह से पलायन वेग कितना होगा?',
    options: ['11.2 km/s', '22.4 km/s', '5.6 km/s', '15.8 km/s'],
    correctIndex: 0,
  },
  {
    subject: 'Physics',
    question: '[NEET PYQ] यदि प्रकाश की तरंगदैर्ध्य 4 × 10⁻⁷ m हो, तो निर्वात में इसकी आवृत्ति (Frequency) लगभग कितनी होगी? (c = 3 × 10⁸ m/s)',
    options: ['7.5 × 10¹⁴ Hz', '1.2 × 10¹⁵ Hz', '3.0 × 10¹⁴ Hz', '6.0 × 10¹³ Hz'],
    correctIndex: 0,
  },
];

export interface NcertRecallCard {
  id: string;
  subject: 'Biology' | 'Chemistry';
  chapter: string;
  beforeBlank: string;
  hiddenAnswer: string;
  afterBlank: string;
}

export const NCERT_RECALL_CARDS: NcertRecallCard[] = [
  {
    id: 'nc-1',
    subject: 'Biology',
    chapter: 'कोशिका चक्र (Cell Cycle)',
    beforeBlank: 'अर्धसूत्री विभाजन (Meiosis) की पूर्वावस्था-I की ',
    hiddenAnswer: 'पैकीटीन (Pachytene)',
    afterBlank: ' उप-अवस्था में जीन विनिमय (Crossing over) होता है।',
  },
  {
    id: 'nc-2',
    subject: 'Biology',
    chapter: 'मानव जनन (Human Reproduction)',
    beforeBlank: 'शुक्राणु के अग्रपिंडक (Acrosome) का निर्माण कोशिका के ',
    hiddenAnswer: 'गॉल्जीकाय (Golgi apparatus)',
    afterBlank: ' द्वारा होता है।',
  },
  {
    id: 'nc-3',
    subject: 'Chemistry',
    chapter: 'd एवं f ब्लॉक तत्व',
    beforeBlank: 'लैंथेनॉइड संकुचन (Lanthanoid contraction) का मुख्य कारण ',
    hiddenAnswer: '4f इलेक्ट्रॉनों का दुर्बल परिरक्षण प्रभाव (Poor shielding)',
    afterBlank: ' होता है।',
  },
  {
    id: 'nc-4',
    subject: 'Biology',
    chapter: 'पारिस्थितिकी (Ecology)',
    beforeBlank: 'एक पोषी स्तर से अगले पोषी स्तर में केवल ',
    hiddenAnswer: '10% ऊर्जा (Lindeman’s 10% Law)',
    afterBlank: ' ही स्थानांतरित होती है।',
  },
];
