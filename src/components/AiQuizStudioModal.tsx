import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FileText,
  Film,
  FolderPlus,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { MCQQuestion } from '../types';

export interface StudioQuizConfig {
  title: string;
  quizType: string;
  durationMins: number;
  subject: string;
  chapter: string;
}

interface UploadedMediaAsset {
  id: string;
  name: string;
  kind: 'video' | 'pdf' | 'document' | 'image';
  sizeLabel: string;
  extractedContext: string;
  durationSec?: number;
}

interface SavedStudioFolder {
  id: string;
  name: string;
  subject: string;
  chapter: string;
  createdAt: number;
  questions: MCQQuestion[];
}

interface AiQuizStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onSaveToChapterBank: (subject: string, chapter: string, questions: MCQQuestion[]) => void;
  onStartLiveAttempt: (questions: MCQQuestion[], config: StudioQuizConfig) => void;
}

const SUBJECT_CHAPTERS: Record<string, string[]> = {
  Physics: [
    'Units & Measurements',
    'Kinematics & Laws of Motion',
    'Work, Energy & Power',
    'Rotational Motion',
    'Gravitation',
    'Thermodynamics & KTG',
    'Electrostatics & Current Electricity',
    'Magnetism & EMI',
    'Optics (Ray & Wave)',
    'Modern Physics & Semiconductors',
  ],
  Chemistry: [
    'Some Basic Concepts & Atomic Structure',
    'Chemical Bonding & Molecular Structure',
    'Thermodynamics & Equilibrium',
    'Electrochemistry & Chemical Kinetics',
    'Coordination Compounds & d-Block',
    'GOC & Hydrocarbons',
    'Haloalkanes, Alcohols, Phenols & Ethers',
    'Aldehydes, Ketones, Carboxylic Acids & Amines',
    'Biomolecules',
  ],
  Botany: [
    'The Living World & Biological Classification',
    'Plant Kingdom',
    'Morphology & Anatomy of Flowering Plants',
    'Cell: The Unit of Life & Cell Cycle',
    'Photosynthesis in Higher Plants',
    'Respiration in Plants & Plant Growth',
    'Sexual Reproduction in Flowering Plants',
    'Molecular Basis of Inheritance',
    'Ecology & Environment',
  ],
  Zoology: [
    'Animal Kingdom',
    'Structural Organisation in Animals',
    'Biomolecules & Digestion',
    'Breathing, Body Fluids & Circulation',
    'Excretory, Locomotion & Neural Control',
    'Chemical Coordination & Integration',
    'Human Reproduction & Reproductive Health',
    'Principles of Inheritance & Evolution',
    'Human Health, Disease & Biotechnology',
  ],
};

const AUTHENTIC_NEET_POOL: Record<string, Array<{
  chapter: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  qHi: string;
  qEn: string;
  optsHi: [string, string, string, string];
  optsEn: [string, string, string, string];
  correct: number;
  expHi: string;
  expEn: string;
  tag: string;
}>> = {
  Botany: [
    {
      chapter: 'The Living World & Biological Classification',
      difficulty: 'Medium',
      qHi: 'निम्नलिखित कथनों को पढ़िए और सही विकल्प का चयन कीजिए:\nकथन I: आर्कीबैक्टीरिया अन्य जीवाणुओं से भिन्न होते हैं क्योंकि इनकी कोशिका भित्ति की संरचना अलग होती है।\nकथन II: मीथेनोजेन अनेक जुगाली करने वाले पशुओं (Ruminants) की आंत में पाए जाते हैं और बायोगैस उत्पादन के लिए उत्तरदायी होते हैं।',
      qEn: 'Read the following statements and choose the correct option:\nStatement I: Archaebacteria differ from other bacteria in having a different cell wall structure.\nStatement II: Methanogens are present in the gut of several ruminant animals and are responsible for biogas production.',
      optsHi: [
        'कथन I और कथन II दोनों सही हैं',
        'कथन I और कथन II दोनों गलत हैं',
        'कथन I सही है, लेकिन कथन II गलत है',
        'कथन I गलत है, लेकिन कथन II सही है',
      ],
      optsEn: [
        'Both Statement I and Statement II are correct',
        'Both Statement I and Statement II are incorrect',
        'Statement I is correct but Statement II is incorrect',
        'Statement I is incorrect but Statement II is correct',
      ],
      correct: 0,
      expHi: 'NCERT कक्षा 11 (जीव जगत का वर्गीकरण): आर्कीबैक्टीरिया की विशिष्ट कोशिका भित्ति संरचना उन्हें चरम आवासों में जीवित रहने में सक्षम बनाती है। मीथेनोजेन गाय और भैंस जैसे जुगाली करने वाले पशुओं की आंत में होते हैं और गोबर से मीथेन (बायोगैस) बनाते हैं।',
      expEn: 'NCERT Class 11 (Biological Classification): Archaebacteria have a unique cell wall structure enabling survival in extreme habitats. Methanogens reside in the gut of ruminants and produce methane.',
      tag: 'NCERT Statement',
    },
    {
      chapter: 'The Living World & Biological Classification',
      difficulty: 'Hard',
      qHi: 'अभिकथन (A): ड्यूटेरोमाइसीटीज़ को सामान्यतः "अपूर्ण कवक" (Imperfect Fungi) कहा जाता है।\nकारण (R): ड्यूटेरोमाइसीटीज़ में केवल अलैंगिक या कायिक प्रावस्थाएँ ही ज्ञात हैं, और लैंगिक प्रावस्था की खोज होने पर इन्हें एस्कोमाइसीटीज़ या बेसिडियोमाइसीटीज़ में स्थानांतरित कर दिया जाता है।',
      qEn: 'Assertion (A): Deuteromycetes are commonly known as imperfect fungi.\nReason (R): Only the asexual or vegetative phases of these fungi are known, and once sexual stages are discovered they are moved into Ascomycetes or Basidiomycetes.',
      optsHi: [
        'A और R दोनों सत्य हैं तथा R, A की सही व्याख्या करता है',
        'A और R दोनों सत्य हैं, परंतु R, A की सही व्याख्या नहीं करता है',
        'A सत्य है, परंतु R असत्य है',
        'A असत्य है, परंतु R सत्य है',
      ],
      optsEn: [
        'Both A and R are true and R is the correct explanation of A',
        'Both A and R are true but R is not the correct explanation of A',
        'A is true but R is false',
        'A is false but R is true',
      ],
      correct: 0,
      expHi: 'NCERT के अनुसार ड्यूटेरोमाइसीटीज़ में लैंगिक जनन ज्ञात नहीं होने के कारण इन्हें अपूर्ण कवक कहते हैं। जब इनके लैंगिक रूपों की खोज हो गई तो उन्हें उचित वर्गों (एस्कोमाइसीटीज़/बेसिडियोमाइसीटीज़) में रख दिया गया।',
      expEn: 'Per NCERT, Deuteromycetes lack known sexual stages, hence called imperfect fungi. Upon discovery of sexual stages, members were moved to Ascomycetes or Basidiomycetes.',
      tag: 'Assertion-Reason',
    },
    {
      chapter: 'Cell: The Unit of Life & Cell Cycle',
      difficulty: 'Medium',
      qHi: 'अर्धसूत्री विभाजन-I (Meiosis-I) की किस उप-प्रावस्था में पुनर्योजन ग्रंथिकाओं (Recombination Nodules) का निर्माण होता है और समजात गुणसूत्रों के असहसंतति अर्धगुणसूत्रों के बीच जीन विनिमय (Crossing Over) होता है?',
      qEn: 'During which sub-stage of Prophase-I of Meiosis-I do recombination nodules appear and crossing over occur between non-sister chromatids of homologous chromosomes?',
      optsHi: ['लेप्टोटीन (Leptotene)', 'जाइगोटीन (Zygotene)', 'पैकीटीन (Pachytene)', 'डिप्लोटीन (Diplotene)'],
      optsEn: ['Leptotene', 'Zygotene', 'Pachytene', 'Diplotene'],
      correct: 2,
      expHi: 'पैकीटीन (Pachytene) प्रावस्था में द्विसंयोजी गुणसूत्र स्पष्ट रूप से चतुष्क (Tetrad) के रूप में दिखाई देते हैं और एंजाइम रिकॉम्बिनेज़ की सहायता से क्रॉसिंग ओवर होता है।',
      expEn: 'In Pachytene, bivalent chromosomes clearly appear as tetrads and crossing over mediated by recombinase enzyme occurs.',
      tag: 'PYQ Concept',
    },
    {
      chapter: 'Photosynthesis in Higher Plants',
      difficulty: 'Hard',
      qHi: 'C4 पादपों में प्रकाश-श्वसन (Photorespiration) क्यों नहीं होता है?',
      qEn: 'Why does photorespiration not occur in C4 plants?',
      optsHi: [
        'इनमें RuBisCO एंजाइम पूर्णतः अनुपस्थित होता है',
        'इनमें एक ऐसी क्रियाविधि होती है जो पूलाच्छद (Bundle Sheath) कोशिकाओं में RuBisCO स्थल पर CO2 की सांद्रता बढ़ा देती है',
        'इनकी पर्णमध्योतक (Mesophyll) कोशिकाओं में केल्विन चक्र संपन्न होता है',
        'इनमें रंध्र केवल रात्रि के समय खुलते हैं',
      ],
      optsEn: [
        'RuBisCO enzyme is completely absent in them',
        'They have a mechanism that increases the concentration of CO2 at the RuBisCO enzyme site in bundle sheath cells',
        'Calvin cycle occurs in their mesophyll cells',
        'Their stomata open only during the night',
      ],
      correct: 1,
      expHi: 'C4 पादपों में पर्णमध्योतक कोशिकाओं से C4 अम्ल (मैलिक/एस्पार्टिक अम्ल) पूलाच्छद कोशिकाओं में जाकर विघटित होता है और CO2 मुक्त करता है, जिससे RuBisCO मुख्यतः कार्बोक्सिलेज़ के रूप में कार्य करता है।',
      expEn: 'In C4 plants, decarboxylation of C4 acids in bundle sheath cells elevates intracellular CO2 concentration so RuBisCO functions predominantly as a carboxylase.',
      tag: 'NCERT Line',
    },
    {
      chapter: 'Molecular Basis of Inheritance',
      difficulty: 'Hard',
      qHi: 'यदि एक द्विरज्जुक DNA अणु में साइटोसीन (Cytosine) का प्रतिशत 18% है, तो उस DNA में एडेनीन (Adenine) का प्रतिशत कितना होगा?',
      qEn: 'If a double-stranded DNA molecule has 18% Cytosine, what will be the percentage of Adenine in that DNA?',
      optsHi: ['18%', '32%', '36%', '64%'],
      optsEn: ['18%', '32%', '36%', '64%'],
      correct: 1,
      expHi: 'चारगाफ के नियम (Chargaff’s Rule) के अनुसार [G] = [C] = 18%। अतः [G + C] = 36%। शेष [A + T] = 100% - 36% = 64%। चूँकि [A] = [T], इसलिए एडेनीन = 64% / 2 = 32% होगा।',
      expEn: 'By Chargaff’s rule, [C] = [G] = 18%, so [G + C] = 36%. Remaining [A + T] = 64%, hence [A] = 32%.',
      tag: 'Numerical',
    },
  ],
  Zoology: [
    {
      chapter: 'Breathing, Body Fluids & Circulation',
      difficulty: 'Medium',
      qHi: 'सामान्य मानव हृदय चक्र (Cardiac Cycle) की अवधि 0.8 सेकंड होती है। इसमें निलय प्रकुंचन (Ventricular Systole) और संयुक्त अनुशिथिलन (Joint Diastole) का समय क्रमशः कितना होता है?',
      qEn: 'The duration of a normal human cardiac cycle is 0.8 seconds. What are the durations of ventricular systole and joint diastole respectively?',
      optsHi: [
        '0.3 सेकंड और 0.4 सेकंड',
        '0.1 सेकंड और 0.7 सेकंड',
        '0.4 सेकंड और 0.3 सेकंड',
        '0.5 सेकंड और 0.3 सेकंड',
      ],
      optsEn: [
        '0.3 sec and 0.4 sec',
        '0.1 sec and 0.7 sec',
        '0.4 sec and 0.3 sec',
        '0.5 sec and 0.3 sec',
      ],
      correct: 0,
      expHi: '0.8 सेकंड के हृदय चक्र में आलिंद प्रकुंचन = 0.1 सेकंड, निलय प्रकुंचन = 0.3 सेकंड तथा चारों कक्षों का संयुक्त अनुशिथिलन (Joint Diastole) = 0.4 सेकंड होता है।',
      expEn: 'In a 0.8 s cardiac cycle: atrial systole = 0.1 s, ventricular systole = 0.3 s, and joint diastole = 0.4 s.',
      tag: 'NCERT Data',
    },
    {
      chapter: 'Human Reproduction & Reproductive Health',
      difficulty: 'Hard',
      qHi: 'निम्नलिखित कथनों का अध्ययन कीजिए:\nकथन I: दुग्धस्रवण अनार्तव (Lactational Amenorrhea) प्रसव के बाद अधिकतम 6 माह की अवधि तक ही प्रभावी गर्भनिरोधक विधि मानी जाती है।\nकथन II: सहेली (Saheli) एक गैर-स्टेरॉयडल (Non-steroidal) मौखिक गर्भनिरोधक गोली है जिसे सप्ताह में एक बार लिया जाता है।',
      qEn: 'Study the following statements:\nStatement I: Lactational amenorrhea is considered an effective contraceptive method only up to a maximum period of 6 months following parturition.\nStatement II: Saheli is a non-steroidal oral contraceptive pill taken once a week.',
      optsHi: [
        'कथन I और कथन II दोनों सत्य हैं',
        'कथन I सत्य है, लेकिन कथन II असत्य है',
        'कथन I असत्य है, लेकिन कथन II सत्य है',
        'कथन I और कथन II दोनों असत्य हैं',
      ],
      optsEn: [
        'Both Statement I and Statement II are true',
        'Statement I is true but Statement II is false',
        'Statement I is false but Statement II is true',
        'Both Statement I and Statement II are false',
      ],
      correct: 0,
      expHi: 'NCERT जनन स्वास्थ्य: तीव्र स्तनपान के दौरान अंडोत्सर्ग नहीं होता, जो प्रसव के बाद अधिकतम 6 माह तक प्रभावी रहता है। CDRI लखनऊ द्वारा विकसित सहेली एक गैर-स्टेरॉयडल "वन्स-ए-वीक" गोली है।',
      expEn: 'NCERT Reproductive Health: Both statements are factually correct per NCERT.',
      tag: 'Statement I & II',
    },
    {
      chapter: 'Human Health, Disease & Biotechnology',
      difficulty: 'Medium',
      qHi: 'प्रतिबंध एंजाइम (Restriction Enzyme) EcoRI में अक्षर "R" और रोमन अंक "I" क्रमशः क्या निरूपित करते हैं?',
      qEn: 'In the restriction enzyme EcoRI, what do the letter "R" and Roman numeral "I" represent respectively?',
      optsHi: [
        'जीनस का नाम और खोज का क्रम',
        'प्रभेद (Strain RY 13) और उस प्रभेद से एंजाइम के पृथक्करण का क्रम',
        'प्रजाति का नाम और अणुभार',
        'रिकॉम्बिनेंट डीएनए और प्रथम प्रतिबंध स्थल',
      ],
      optsEn: [
        'Genus name and order of discovery',
        'Strain (RY 13) and order in which the enzyme was isolated from that strain',
        'Species name and molecular weight',
        'Recombinant DNA and first restriction site',
      ],
      correct: 1,
      expHi: 'EcoRI में E = Escherichia (वंश), co = coli (जाति), R = प्रभेद RY 13 का नाम, तथा रोमन अंक I उस जीवाणु प्रभेद से एंजाइम के पृथक किए जाने का क्रम दर्शाता है।',
      expEn: 'In EcoRI, "R" is derived from the name of strain RY 13 and Roman numeral "I" indicates the order of isolation.',
      tag: 'Biotech Core',
    },
  ],
  Physics: [
    {
      chapter: 'Units & Measurements',
      difficulty: 'Medium',
      qHi: 'यदि किसी भौतिक राशि $X = \\frac{a^2 b^3}{c\\sqrt{d}}$ के मापन में $a, b, c$ और $d$ में प्रतिशत त्रुटियाँ क्रमशः $1\\%, 2\\%, 3\\%$ तथा $4\\%$ हैं, तो $X$ के मान में अधिकतम प्रतिशत त्रुटि कितनी होगी?',
      qEn: 'If the percentage errors in the measurement of $a, b, c$ and $d$ in $X = \\frac{a^2 b^3}{c\\sqrt{d}}$ are $1\\%, 2\\%, 3\\%$ and $4\\%$ respectively, what is the maximum percentage error in $X$?',
      optsHi: ['10%', '13%', '11%', '8%'],
      optsEn: ['10%', '13%', '11%', '8%'],
      correct: 1,
      expHi: '$\\frac{\\Delta X}{X}\\% = 2(1\\%) + 3(2\\%) + 1(3\\%) + \\frac{1}{2}(4\\%) = 2\\% + 6\\% + 3\\% + 2\\% = 13\\%$।',
      expEn: 'Maximum % error = $2(1\\%) + 3(2\\%) + 3\\% + 0.5(4\\%) = 13\\%$.',
      tag: 'Numerical',
    },
    {
      chapter: 'Electrostatics & Current Electricity',
      difficulty: 'Hard',
      qHi: 'एक समांतर पट्ट संधारित्र (Parallel Plate Capacitor) की प्लेटों के बीच वायु होने पर धारिता $8\\text{ pF}$ है। यदि प्लेटों के बीच की दूरी आधी कर दी जाए और उनके मध्य परावैद्युतांक $K = 6$ का पदार्थ भर दिया जाए, तो नई धारिता क्या होगी?',
      qEn: 'A parallel plate capacitor with air between the plates has a capacitance of $8\\text{ pF}$. What will be the capacitance if the distance between the plates is reduced by half and the space between them is filled with a substance of dielectric constant $K = 6$?',
      optsHi: ['48 pF', '96 pF', '24 pF', '12 pF'],
      optsEn: ['48 pF', '96 pF', '24 pF', '12 pF'],
      correct: 1,
      expHi: 'प्रारंभिक धारिता $C_0 = \\frac{\\varepsilon_0 A}{d} = 8\\text{ pF}$। नई धारिता $C\' = \\frac{K \\varepsilon_0 A}{d/2} = 2K C_0 = 2 \\times 6 \\times 8 = 96\\text{ pF}$।',
      expEn: 'New capacitance $C\' = \\frac{K\\varepsilon_0 A}{d/2} = 2K C_0 = 2 \\times 6 \\times 8 = 96\\text{ pF}$.',
      tag: 'NCERT Exercise',
    },
    {
      chapter: 'Modern Physics & Semiconductors',
      difficulty: 'Medium',
      qHi: 'हाइड्रोजन परमाणु की प्रथम बोर कक्षा में इलेक्ट्रॉन की ऊर्जा $-13.6\\text{ eV}$ है। इसकी तीसरी उत्तेजित अवस्था (Third Excited State, $n = 4$) में इलेक्ट्रॉन की ऊर्जा कितनी होगी?',
      qEn: 'The energy of an electron in the first Bohr orbit of a hydrogen atom is $-13.6\\text{ eV}$. What is its energy in the third excited state ($n = 4$)?',
      optsHi: ['-3.40 eV', '-1.51 eV', '-0.85 eV', '-0.54 eV'],
      optsEn: ['-3.40 eV', '-1.51 eV', '-0.85 eV', '-0.54 eV'],
      correct: 2,
      expHi: 'तीसरी उत्तेजित अवस्था का अर्थ $n = 4$ है। $E_4 = \\frac{-13.6}{4^2} = \\frac{-13.6}{16} = -0.85\\text{ eV}$।',
      expEn: 'Third excited state corresponds to $n = 4$: $E_4 = -13.6 / 16 = -0.85\\text{ eV}$.',
      tag: 'Atoms PYQ',
    },
  ],
  Chemistry: [
    {
      chapter: 'Chemical Bonding & Molecular Structure',
      difficulty: 'Medium',
      qHi: 'निम्नलिखित में से किस प्रजाति (Species) की ज्यामिति वर्ग समतलीय (Square Planar) और संकरण $sp^3d^2$ होता है?',
      qEn: 'Which of the following species possesses square planar geometry with $sp^3d^2$ hybridisation?',
      optsHi: ['$\\text{SF}_4$', '$\\text{XeF}_4$', '$\\text{BF}_4^-$', '$\\text{NH}_4^+$'],
      optsEn: ['$\\text{SF}_4$', '$\\text{XeF}_4$', '$\\text{BF}_4^-$', '$\\text{NH}_4^+$'],
      correct: 1,
      expHi: '$\\text{XeF}_4$ में केंद्रीय परमाणु Xe पर 4 आबंध युग्म (Bond Pairs) और 2 एकाकी युग्म (Lone Pairs) होते हैं, जिससे $sp^3d^2$ संकरण तथा वर्ग समतलीय ज्यामिति प्राप्त होती है।',
      expEn: '$\\text{XeF}_4$ has 4 bond pairs and 2 lone pairs on Xe, resulting in $sp^3d^2$ hybridisation and square planar geometry.',
      tag: 'VSEPR Core',
    },
    {
      chapter: 'Electrochemistry & Chemical Kinetics',
      difficulty: 'Hard',
      qHi: 'एक प्रथम कोटि की अभिक्रिया (First Order Reaction) को $75\\%$ पूर्ण होने में $40\\text{ मिनट}$ का समय लगता है। इस अभिक्रिया का अर्ध-आयु काल ($t_{1/2}$) कितना होगा?',
      qEn: 'A first-order reaction takes $40\\text{ minutes}$ for $75\\%$ completion. What is the half-life ($t_{1/2}$) of this reaction?',
      optsHi: ['10 मिनट', '20 मिनट', '30 मिनट', '15 मिनट'],
      optsEn: ['10 min', '20 min', '30 min', '15 min'],
      correct: 1,
      expHi: 'प्रथम कोटि अभिक्रिया में $75\\%$ पूर्ण होने में दो अर्ध-आयु काल ($t_{75\\%} = 2 \\times t_{1/2}$) लगते हैं। अतः $t_{1/2} = 40 / 2 = 20\\text{ मिनट}$।',
      expEn: 'For a first-order reaction, $t_{75\\%} = 2 \\times t_{1/2}$, therefore $t_{1/2} = 40 / 2 = 20\\text{ min}$.',
      tag: 'Kinetics PYQ',
    },
    {
      chapter: 'GOC & Hydrocarbons',
      difficulty: 'Hard',
      qHi: 'निम्नलिखित कार्बधनायनों (Carbocations) के स्थायित्व का सही घटता क्रम क्या है?',
      qEn: 'What is the correct decreasing order of stability of the following carbocations?',
      optsHi: [
        '$(CH_3)_3C^+ > (CH_3)_2CH^+ > CH_3CH_2^+ > CH_3^+$',
        '$CH_3^+ > CH_3CH_2^+ > (CH_3)_2CH^+ > (CH_3)_3C^+$',
        '$(CH_3)_2CH^+ > (CH_3)_3C^+ > CH_3CH_2^+ > CH_3^+$',
        '$CH_3CH_2^+ > CH_3^+ > (CH_3)_2CH^+ > (CH_3)_3C^+$',
      ],
      optsEn: [
        '$(CH_3)_3C^+ > (CH_3)_2CH^+ > CH_3CH_2^+ > CH_3^+$',
        '$CH_3^+ > CH_3CH_2^+ > (CH_3)_2CH^+ > (CH_3)_3C^+$',
        '$(CH_3)_2CH^+ > (CH_3)_3C^+ > CH_3CH_2^+ > CH_3^+$',
        '$CH_3CH_2^+ > CH_3^+ > (CH_3)_2CH^+ > (CH_3)_3C^+$',
      ],
      correct: 0,
      expHi: 'अतिसंयुग्मन (Hyperconjugation) और $+I$ प्रभाव के कारण तृतीयक ($3^\\circ$) कार्बधनायन सर्वाधिक स्थायी होता है ($9\\ \\alpha\\text{-H}$), इसके बाद $2^\\circ$ ($6\\ \\alpha\\text{-H}$), फिर $1^\\circ$ ($3\\ \\alpha\\text{-H}$) और अंत में मेथिल कार्बधनायन आता है।',
      expEn: 'Due to hyperconjugation ($9, 6, 3, 0\\ \\alpha$-hydrogens) and $+I$ effect, stability decreases in the order $3^\\circ > 2^\\circ > 1^\\circ > CH_3^+$.',
      tag: 'GOC Stability',
    },
  ],
};

const STORAGE_FOLDERS_KEY = 'neet2027_ai_studio_folders_v2';
const STORAGE_PERSONAL_BANK_KEY = 'neet2027_personal_chapter_bank_v2';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeSaveLocalStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readStoredGeminiApiKey(): string {
  try {
    const direct = localStorage.getItem('gemini_api_key') || localStorage.getItem('neet_gemini_api_key');
    if (direct && direct.trim().length > 10) return direct.trim();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const val = localStorage.getItem(k) || '';
      if (val.includes('AIzaSy')) {
        const match = val.match(/AIzaSy[0-9A-Za-z_-]{30,}/);
        if (match) return match[0];
      }
    }
  } catch {}
  return '';
}

function normalizeQuestionItem(raw: any, idx: number, fallbackSubject: string, fallbackChapter: string): MCQQuestion {
  const validSubjects = ['Physics', 'Chemistry', 'Botany', 'Zoology'] as const;
  const subj = validSubjects.includes(raw?.subject)
    ? raw.subject
    : validSubjects.includes(fallbackSubject as any)
    ? fallbackSubject
    : 'Botany';

  const rawOptsHi = Array.isArray(raw?.options_hi) ? raw.options_hi : [];
  const optionsHi = [0, 1, 2, 3].map((i) =>
    String(rawOptsHi[i] ?? raw?.options_en?.[i] ?? `विकल्प ${['A', 'B', 'C', 'D'][i]}`)
  );

  const rawOptsEn = Array.isArray(raw?.options_en) ? raw.options_en : [];
  const optionsEn = [0, 1, 2, 3].map((i) =>
    String(rawOptsEn[i] ?? optionsHi[i] ?? `Option ${['A', 'B', 'C', 'D'][i]}`)
  );

  const corrRaw =
    typeof raw?.correct_index === 'number'
      ? raw.correct_index
      : typeof raw?.correctIndex === 'number'
      ? raw.correctIndex
      : 0;
  const correctIdx = Number.isFinite(corrRaw) && corrRaw >= 0 && corrRaw <= 3 ? corrRaw : 0;

  const diffRaw = String(raw?.difficulty || 'Medium');
  const difficulty: 'Easy' | 'Medium' | 'Hard' =
    diffRaw === 'Easy' || diffRaw === 'Hard' ? diffRaw : 'Medium';

  const tags = Array.isArray(raw?.tags)
    ? raw.tags.map((t: any) => String(t)).filter(Boolean)
    : [String(raw?.topic || 'NCERT High-Yield')];

  return {
    id: String(raw?.id || `studio_mcq_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`),
    subject: subj as MCQQuestion['subject'],
    chapter: String(raw?.chapter || fallbackChapter || 'General NCERT'),
    difficulty,
    question_hi: String(raw?.question_hi || raw?.question_en || `प्रश्न ${idx + 1}`),
    question_en: String(raw?.question_en || raw?.question_hi || `Question ${idx + 1}`),
    options_hi: optionsHi,
    options_en: optionsEn,
    correct_index: correctIdx,
    explanation_hi: String(raw?.explanation_hi || raw?.explanation_en || 'NCERT के सिद्धांत के अनुसार सही विकल्प चुनें।'),
    explanation_en: String(raw?.explanation_en || raw?.explanation_hi || 'Select the correct option per NCERT.'),
    tags,
    isStarred: Boolean(raw?.isStarred),
    isSaved: true,
  };
}

async function extractVideoMetadataSafe(file: File): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => {
        try {
          URL.revokeObjectURL(url);
          video.removeAttribute('src');
          video.load();
        } catch {}
      };

      const timer = window.setTimeout(() => {
        cleanup();
        resolve({ durationSec: 0, width: 0, height: 0 });
      }, 2500);

      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        const durationSec = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        cleanup();
        resolve({ durationSec, width, height });
      };

      video.onerror = () => {
        window.clearTimeout(timer);
        cleanup();
        resolve({ durationSec: 0, width: 0, height: 0 });
      };

      video.src = url;
    } catch {
      resolve({ durationSec: 0, width: 0, height: 0 });
    }
  });
}

async function extractDocumentTextSafe(file: File): Promise<string> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
      const slice = file.slice(0, 60000);
      const txt = await slice.text();
      return txt.replace(/\s+/g, ' ').trim().slice(0, 2600);
    }
    const slice = file.slice(0, 200000);
    const buffer = await slice.arrayBuffer();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(buffer);
    const readableMatches = rawText.match(/[A-Za-z0-9\u0900-\u097F][A-Za-z0-9\u0900-\u097F ,.;:()\-+/=%]{14,}/g) || [];
    return readableMatches.slice(0, 50).join(' ').replace(/\s+/g, ' ').trim().slice(0, 2200);
  } catch {
    return '';
  }
}

async function generateViaGeminiIfAvailable(params: {
  prompt: string;
  subject: string;
  chapter: string;
  count: number;
  difficulty: string;
  quizType: string;
  assets: UploadedMediaAsset[];
}): Promise<MCQQuestion[] | null> {
  const apiKey = readStoredGeminiApiKey();
  if (!apiKey) return null;

  const { prompt, subject, chapter, count, difficulty, quizType, assets } = params;
  const mediaSummary = assets
    .map((a) => `- [${a.kind.toUpperCase()}] ${a.name}: ${a.extractedContext.slice(0, 600)}`)
    .join('\n');

  const sysPrompt = `You are a senior NTA NEET-UG paper setter. Generate ${count} authentic, clean, exam-standard NEET MCQs in Hindi (with English translation) for Subject: ${subject}, Chapter: ${chapter}, Difficulty: ${difficulty}, Pattern: ${quizType}.
User focus: ${prompt || 'Strict NCERT Class 11 & 12 Line-by-Line High-Yield Concepts'}
${mediaSummary ? `Reference Study Material:\n${mediaSummary}` : ''}

CRITICAL RULES:
1. NEVER include bracketed tags, question numbers, or "(NCERT Line-by-Line #1)" prefixes inside question_hi or question_en. Write clean, real exam questions directly.
2. Return ONLY a valid JSON array of objects with exact keys:
[{"question_hi":"...","question_en":"...","options_hi":["A","B","C","D"],"options_en":["A","B","C","D"],"correct_index":0,"explanation_hi":"...","explanation_en":"...","tags":["${quizType}"]}]`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sysPrompt }] }],
          generationConfig: {
            temperature: 0.45,
            responseMimeType: 'application/json',
          },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.slice(0, count).map((item, i) =>
      normalizeQuestionItem(
        {
          ...item,
          subject,
          chapter,
          difficulty: difficulty === 'Easy' ? 'Easy' : difficulty === 'Medium' ? 'Medium' : 'Hard',
        },
        i,
        subject,
        chapter
      )
    );
  } catch {
    return null;
  }
}

function buildCuratedExamMcqs(params: {
  prompt: string;
  subject: string;
  chapter: string;
  count: number;
  difficulty: string;
  quizType: string;
  assets: UploadedMediaAsset[];
}): MCQQuestion[] {
  const { subject, chapter, count, difficulty, quizType, assets } = params;
  const safeCount = Math.min(Math.max(1, Number(count) || 10), 50);
  const mappedDiff: 'Easy' | 'Medium' | 'Hard' =
    difficulty === 'Easy' ? 'Easy' : difficulty === 'Medium' ? 'Medium' : 'Hard';

  const subjectBank = AUTHENTIC_NEET_POOL[subject] || AUTHENTIC_NEET_POOL.Botany;
  const chapterMatched = subjectBank.filter(
    (q) => q.chapter.toLowerCase() === chapter.toLowerCase()
  );
  const sourcePool = chapterMatched.length > 0 ? [...chapterMatched, ...subjectBank] : subjectBank;

  const out: MCQQuestion[] = [];
  for (let i = 0; i < safeCount; i++) {
    const item = sourcePool[i % sourcePool.length];
    out.push(
      normalizeQuestionItem(
        {
          id: `neet_exam_${Date.now()}_${i}`,
          subject,
          chapter: chapter || item.chapter,
          difficulty: mappedDiff,
          question_hi: item.qHi,
          question_en: item.qEn,
          options_hi: item.optsHi,
          options_en: item.optsEn,
          correct_index: item.correct,
          explanation_hi: item.expHi,
          explanation_en: item.expEn,
          tags: [assets.length > 0 ? 'Media/Doc NCERT' : item.tag || quizType],
        },
        i,
        subject,
        chapter
      )
    );
  }
  return out;
}

export const AiQuizStudioModal: React.FC<AiQuizStudioModalProps> = ({
  isOpen,
  onClose,
  onToast,
  onSaveToChapterBank,
  onStartLiveAttempt,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'folders'>('create');
  const [subject, setSubject] = useState<string>('Botany');
  const [chapter, setChapter] = useState<string>(SUBJECT_CHAPTERS.Botany[0]);
  const [prompt, setPrompt] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [difficulty, setDifficulty] = useState<string>('NEET Hard');
  const [quizType, setQuizType] = useState<string>('NCERT Line-by-Line');
  const [durationMins, setDurationMins] = useState<number>(20);
  const [quizTitle, setQuizTitle] = useState<string>('');

  const [uploadedAssets, setUploadedAssets] = useState<UploadedMediaAsset[]>([]);
  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<MCQQuestion[]>([]);

  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  const [folders, setFolders] = useState<SavedStudioFolder[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_FOLDERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [folderSearch, setFolderSearch] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const list = SUBJECT_CHAPTERS[subject] || ['General Chapter'];
    if (!list.includes(chapter)) {
      setChapter(list[0]);
    }
  }, [subject, chapter]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {}
    };
  }, []);

  const persistFolders = (nextFolders: SavedStudioFolder[]) => {
    setFolders(nextFolders);
    safeSaveLocalStorage(STORAGE_FOLDERS_KEY, nextFolders);
  };

  const handleToggleVoice = () => {
    try {
      if (isListening) {
        recognitionRef.current?.stop?.();
        setIsListening(false);
        return;
      }
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        onToast('इस ब्राउज़र में वॉइस इनपुट उपलब्ध नहीं है।', 'error');
        return;
      }
      const rec = new SpeechRec();
      rec.lang = 'hi-IN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        const transcript = e?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      onToast('वॉइस माइक शुरू करने में त्रुटि आई।', 'error');
    }
  };

  const handleMediaFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsProcessingMedia(true);
    try {
      const files = Array.from(fileList);
      const newAssets: UploadedMediaAsset[] = [];

      for (const file of files) {
        const mime = (file.type || '').toLowerCase();
        const lowerName = file.name.toLowerCase();
        const isVideo =
          mime.startsWith('video/') ||
          /\.(mp4|mov|webm|mkv|avi|m4v|3gp)$/i.test(lowerName);
        const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf');
        const isImage =
          mime.startsWith('image/') ||
          /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lowerName);

        if (isVideo) {
          const meta = await extractVideoMetadataSafe(file);
          const mins = meta.durationSec > 0 ? Math.ceil(meta.durationSec / 60) : 0;
          newAssets.push({
            id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'video',
            sizeLabel: formatBytes(file.size),
            durationSec: meta.durationSec,
            extractedContext: `Video Lecture: ${file.name}${mins > 0 ? ` (${mins} mins)` : ''}`,
          });
        } else if (isImage) {
          newAssets.push({
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'image',
            sizeLabel: formatBytes(file.size),
            extractedContext: `NCERT Diagram / Notes: ${file.name}`,
          });
        } else {
          const extracted = await extractDocumentTextSafe(file);
          newAssets.push({
            id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: isPdf ? 'pdf' : 'document',
            sizeLabel: formatBytes(file.size),
            extractedContext: extracted || `Study Document: ${file.name}`,
          });
        }
      }

      setUploadedAssets((prev) => [...prev, ...newAssets]);
      onToast(`${newAssets.length} फ़ाइल/वीडियो सफलतापूर्वक जुड़ गई।`, 'success');
    } catch (err) {
      console.error('Media upload processing error:', err);
      onToast('फ़ाइल प्रोसेस करते समय समस्या आई, कृपया पुनः प्रयास करें।', 'error');
    } finally {
      setIsProcessingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleGenerateQuestions = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const aiMcqs = await generateViaGeminiIfAvailable({
        prompt,
        subject,
        chapter,
        count: questionCount,
        difficulty,
        quizType,
        assets: uploadedAssets,
      });

      const finalMcqs =
        aiMcqs && aiMcqs.length > 0
          ? aiMcqs
          : buildCuratedExamMcqs({
              prompt,
              subject,
              chapter,
              count: questionCount,
              difficulty,
              quizType,
              assets: uploadedAssets,
            });

      setGeneratedQuestions(finalMcqs);
      onToast(
        aiMcqs
          ? `✨ Gemini AI ने ${finalMcqs.length} असली NEET प्रश्न तैयार किए!`
          : `✅ ${finalMcqs.length} साफ़-सुथरे NTA NEET स्तर के प्रश्न तैयार हो गए!`,
        'success'
      );
    } catch (err) {
      console.error('Generate MCQs error:', err);
      onToast('प्रश्न जनरेट करने में त्रुटि आई।', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToPersonalBank = () => {
    if (generatedQuestions.length === 0) return;
    try {
      const normalized = generatedQuestions.map((q, i) =>
        normalizeQuestionItem(q, i, subject, chapter)
      );
      const rawBank = localStorage.getItem(STORAGE_PERSONAL_BANK_KEY);
      const bankObj = rawBank ? JSON.parse(rawBank) : {};
      const key = `${subject}::${chapter}`;
      const existing: MCQQuestion[] = Array.isArray(bankObj[key]) ? bankObj[key] : [];
      bankObj[key] = [...normalized, ...existing].slice(0, 300);
      safeSaveLocalStorage(STORAGE_PERSONAL_BANK_KEY, bankObj);
      onSaveToChapterBank(subject, chapter, normalized);
    } catch (err) {
      console.error('Save bank error:', err);
      onToast('पर्सनल बैंक में सेव करने में त्रुटि आई।', 'error');
    }
  };

  const handleSaveToFolder = () => {
    if (generatedQuestions.length === 0) return;
    const folderName =
      newFolderName.trim() || `${subject} • ${chapter} (${generatedQuestions.length} Qs)`;
    const normalized = generatedQuestions.map((q, i) =>
      normalizeQuestionItem(q, i, subject, chapter)
    );
    const next: SavedStudioFolder[] = [
      {
        id: `fld_${Date.now()}`,
        name: folderName,
        subject,
        chapter,
        createdAt: Date.now(),
        questions: normalized,
      },
      ...folders,
    ].slice(0, 40);
    persistFolders(next);
    setNewFolderName('');
    onToast(`📁 "${folderName}" फ़ोल्डर में सेव हो गया।`, 'success');
  };

  const handleLaunchQuizSafe = (qsToLaunch: MCQQuestion[], customTitle?: string) => {
    try {
      const safeList = (Array.isArray(qsToLaunch) ? qsToLaunch : []).map((q, i) =>
        normalizeQuestionItem(q, i, subject, chapter)
      );
      if (safeList.length === 0) {
        onToast('लॉन्च करने के लिए पहले प्रश्न जनरेट करें।', 'error');
        return;
      }
      const cfg: StudioQuizConfig = {
        title: customTitle || quizTitle.trim() || `${subject} • ${chapter}`,
        quizType,
        durationMins: Math.max(5, Number(durationMins) || Math.ceil(safeList.length * 1.2)),
        subject,
        chapter,
      };
      onStartLiveAttempt(safeList, cfg);
    } catch (err) {
      console.error('Launch quiz error:', err);
      onToast('लाइव क्विज़ लॉन्च करने में समस्या आई।', 'error');
    }
  };

  const filteredFolders = useMemo(() => {
    const q = folderSearch.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.subject.toLowerCase().includes(q) ||
        f.chapter.toLowerCase().includes(q)
    );
  }, [folders, folderSearch]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AI Custom Quiz & Media Studio"
    >
      <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white dark:bg-[#141923] border border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-[#6366F1] dark:text-indigo-400">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                AI Custom Quiz, Video &amp; PDF Studio
              </h2>
              <p className="text-[11px] text-[#64748B]">
                NTA NEET Exam-Grade Questions • Video, PDF, Docs &amp; Voice Supported
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-[#6366F1] text-white'
                  : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              Studio Generator
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('folders')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                activeTab === 'folders'
                  ? 'bg-[#6366F1] text-white'
                  : 'bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              My Vaults ({folders.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Studio"
              className="w-8 h-8 rounded-lg bg-[#EEF2F7] dark:bg-[#1C2331] text-[#475569] dark:text-[#94A3B8] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'create' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Subject
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {Object.keys(SUBJECT_CHAPTERS).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Chapter (Personal Bank Merge)
                  </label>
                  <select
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    className="w-full h-9.5 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {(SUBJECT_CHAPTERS[subject] || ['General']).map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#64748B]">
                    Topic Prompt / Custom Instructions (Hindi या English)
                  </label>
                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      isListening
                        ? 'bg-rose-500 text-white'
                        : 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25'
                    }`}
                  >
                    {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    <span>{isListening ? 'Stop Voice' : 'Voice Prompt'}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="उदा. Krebs Cycle के सभी एंजाइम और ATP गणना पर Assertion-Reason व NCERT ट्रैप प्रश्न बनाएं..."
                  className="w-full p-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs text-[#0F172A] dark:text-[#F1F5F9] leading-relaxed"
                />
              </div>

              <div className="rounded-xl p-3 bg-[#F4F6FA] dark:bg-[#0E121B] border border-dashed border-slate-300 dark:border-white/[0.12] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    Upload Study PDF / Docs / Notes OR Lecture Video (MP4, MOV, MKV, WEBM)
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.txt,.md,.csv,image/*"
                      onChange={(e) => void handleMediaFilesSelected(e.target.files)}
                      className="hidden"
                    />
                    <input
                      ref={videoInputRef}
                      type="file"
                      multiple
                      accept="video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v"
                      onChange={(e) => void handleMediaFilesSelected(e.target.files)}
                      className="hidden"
                    />

                    <button
                      type="button"
                      disabled={isProcessingMedia}
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 px-3 rounded-lg bg-white dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#6366F1]" />
                      <span>Upload PDF / Doc</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessingMedia}
                      onClick={() => videoInputRef.current?.click()}
                      className="h-8 px-3 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Upload Video</span>
                    </button>
                  </div>
                </div>

                {isProcessingMedia && (
                  <div className="text-[11px] text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>फ़ाइल/वीडियो से विषय-वस्तु निकाली जा रही है...</span>
                  </div>
                )}

                {uploadedAssets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {uploadedAssets.map((asset) => (
                      <span
                        key={asset.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-[11px] font-medium text-[#0F172A] dark:text-[#F1F5F9]"
                      >
                        {asset.kind === 'video' ? (
                          <Film className="w-3 h-3 text-rose-500" />
                        ) : (
                          <FileText className="w-3 h-3 text-indigo-500" />
                        )}
                        <span className="max-w-[170px] truncate">{asset.name}</span>
                        <span className="text-[10px] text-[#64748B]">({asset.sizeLabel})</span>
                        <button
                          type="button"
                          onClick={() =>
                            setUploadedAssets((prev) => prev.filter((a) => a.id !== asset.id))
                          }
                          className="text-[#64748B] hover:text-rose-500 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Questions ({questionCount})
                  </label>
                  <select
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value) || 10)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {[5, 10, 15, 20, 30, 45].map((n) => (
                      <option key={n} value={n}>
                        {n} MCQs
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {['Easy', 'Medium', 'NEET Hard', 'Rank-Booster'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Pattern Type
                  </label>
                  <select
                    value={quizType}
                    onChange={(e) => setQuizType(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {[
                      'NCERT Line-by-Line',
                      'Assertion-Reason',
                      'Statement I & II',
                      'PYQ Pattern',
                      'Numerical & Trap',
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Timer (Mins)
                  </label>
                  <select
                    value={durationMins}
                    onChange={(e) => setDurationMins(Number(e.target.value) || 15)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]"
                  >
                    {[10, 15, 20, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>
                        {m} Mins
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isGenerating || isProcessingMedia}
                  onClick={() => void handleGenerateQuestions()}
                  className="h-10 px-5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {isGenerating
                      ? 'Generating Exam-Grade MCQs...'
                      : `Generate ${questionCount} NEET MCQs`}
                  </span>
                </button>

                {generatedQuestions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLaunchQuizSafe(generatedQuestions)}
                      className="h-10 px-5 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Launch Full-Screen Live Attempt ({generatedQuestions.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveToPersonalBank}
                      className="h-10 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-800 dark:text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Merge to My Chapter Bank</span>
                    </button>
                  </>
                )}
              </div>

              {generatedQuestions.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Custom Folder / Vault Name (e.g., Botany Test 01)..."
                      className="flex-1 min-w-[200px] h-9 px-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveToFolder}
                      className="h-9 px-3.5 rounded-xl bg-[#EEF2F7] dark:bg-[#1C2331] hover:bg-slate-200 dark:hover:bg-[#242D3F] text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-[#6366F1]" />
                      <span>Save to Vault</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {generatedQuestions.slice(0, 6).map((q, idx) => (
                      <div
                        key={q.id}
                        className="p-3 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                          <span className="font-bold text-[#6366F1]">
                            Q{idx + 1} · {q.subject} · {q.chapter}
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Ans:{' '}
                            {['A', 'B', 'C', 'D'][q.correct_index] || 'A'}
                          </span>
                        </div>
                        <p className="font-hindi text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] whitespace-pre-line">
                          {q.question_hi}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  placeholder="Search saved folders by subject, chapter or name..."
                  className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#F4F6FA] dark:bg-[#1C2331] border border-slate-200 dark:border-white/[0.08] text-xs text-[#0F172A] dark:text-[#F1F5F9]"
                />
              </div>

              {filteredFolders.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06]">
                  <Layers className="w-7 h-7 text-[#64748B] mx-auto mb-2" />
                  <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    No Saved Quiz Vaults Yet
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    Generate MCQs from prompts, PDFs, or videos and click "Save to Vault".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredFolders.map((fld) => (
                    <div
                      key={fld.id}
                      className="p-3.5 rounded-xl bg-[#F4F6FA] dark:bg-[#0E121B] border border-slate-200 dark:border-white/[0.06] flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                            {fld.name}
                          </h3>
                          <button
                            type="button"
                            onClick={() =>
                              persistFolders(folders.filter((f) => f.id !== fld.id))
                            }
                            className="text-[#64748B] hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          <BookOpen className="w-3 h-3 inline mr-1" />
                          {fld.subject} • {fld.chapter} • {fld.questions.length} MCQs
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLaunchQuizSafe(fld.questions, fld.name)}
                        className="h-8 w-full rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Launch Live Quiz</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
