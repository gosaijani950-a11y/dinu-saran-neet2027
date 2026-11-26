import type { MCQQuestion } from '../types';

/**
 * 8 authentic Hindi NCERT NEET questions (2 per PCBZ subject)
 * strictly labeled as 'Starter Sample' so users can test the Quiz/Scroll/Result UI
 * immediately even before configuring their Gemini API key.
 */
export const STARTER_SAMPLE_QUESTIONS: MCQQuestion[] = [
  // ================= PHYSICS (2) =================
  {
    id: 'starter-phy-1',
    subject: 'Physics',
    chapter: 'Laws of Motion',
    difficulty: 'Medium',
    tags: ['Starter Sample', 'NCERT Line', 'Numerical'],
    concept_key: 'starter-newton-second-law-impulse',
    question_hi:
      '$2\\ \\text{kg}$ द्रव्यमान का एक गुटका घर्षणरहित क्षैतिज सतह पर विरामावस्था में रखा है। यदि इस पर $10\\ \\text{N}$ का नियत क्षैतिज बल $4\\ \\text{s}$ तक कार्य करे, तो गुटके द्वारा प्राप्त अंतिम संवेग तथा गतिज ऊर्जा क्रमशः कितनी होगी?',
    options_hi: [
      '$40\\ \\text{kg}\\cdot\\text{m/s}$ तथा $400\\ \\text{J}$',
      '$20\\ \\text{kg}\\cdot\\text{m/s}$ तथा $200\\ \\text{J}$',
      '$40\\ \\text{kg}\\cdot\\text{m/s}$ तथा $200\\ \\text{J}$',
      '$80\\ \\text{kg}\\cdot\\text{m/s}$ तथा $400\\ \\text{J}$',
    ],
    correct_index: 0,
    explanation_hi:
      'आवेग-संवेग प्रमेय के अनुसार संवेग में परिवर्तन $\\Delta p = F \\cdot \\Delta t = 10 \\times 4 = 40\\ \\text{kg}\\cdot\\text{m/s}$। चूँकि गुटका विरामावस्था से चलना प्रारंभ करता है, इसलिए अंतिम संवेग $p = 40\\ \\text{kg}\\cdot\\text{m/s}$ होगा। गतिज ऊर्जा $K = \\frac{p^2}{2m} = \\frac{40^2}{2 \\times 2} = \\frac{1600}{4} = 400\\ \\text{J}$।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000001000,
  },
  {
    id: 'starter-phy-2',
    subject: 'Physics',
    chapter: 'Current Electricity',
    difficulty: 'Medium',
    tags: ['Starter Sample', 'NCERT Line'],
    concept_key: 'starter-wheatstone-bridge-balance',
    question_hi:
      'संतुलित व्हीटस्टोन सेतु में चार भुजाओं के प्रतिरोध क्रमशः $P, Q, R$ तथा $S$ हैं। यदि गैल्वेनोमीटर और सेल की स्थितियों को आपस में बदल दिया जाए, तो संतुलन की स्थिति पर क्या प्रभाव पड़ेगा?',
    options_hi: [
      'संतुलन की स्थिति अपरिवर्तित रहती है',
      'गैल्वेनोमीटर में अधिकतम धारा प्रवाहित होने लगती है',
      'नया संतुलन केवल $P \\cdot R = Q \\cdot S$ होने पर मिलता है',
      'सेतु की सुग्राहिता शून्य हो जाती है',
    ],
    correct_index: 0,
    explanation_hi:
      'व्हीटस्टोन सेतु के संतुलन की शर्त $\\frac{P}{Q} = \\frac{R}{S}$ होती है, जिसे $\\frac{P}{R} = \\frac{Q}{S}$ के रूप में भी लिखा जा सकता है। इसलिए संयुग्मी भुजाओं में स्थित गैल्वेनोमीटर और बैटरी को आपस में बदलने पर संतुलन की स्थिति पर कोई प्रभाव नहीं पड़ता।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000002000,
  },

  // ================= CHEMISTRY (2) =================
  {
    id: 'starter-chem-1',
    subject: 'Chemistry',
    chapter: 'Chemical Bonding and Molecular Structure',
    difficulty: 'Medium',
    tags: ['Starter Sample', 'Exception', 'NCERT Line'],
    concept_key: 'starter-dipole-moment-nh3-nf3',
    question_hi:
      '\\ce{NH3} तथा \\ce{NF3} दोनों की ज्यामिति पिरामिडीय (pyramidal) है तथा दोनों में नाइट्रोजन पर एक एकाकी इलेक्ट्रॉन युग्म उपस्थित है, फिर भी \\ce{NH3} का द्विध्रुव आघूर्ण ($4.90 \\times 10^{-30}\\ \\text{C}\\cdot\\text{m}$) \\ce{NF3} ($0.80 \\times 10^{-30}\\ \\text{C}\\cdot\\text{m}$) से अधिक क्यों होता है?',
    options_hi: [
      '\\ce{NH3} में कक्षीय द्विध्रुव और \\ce{N-H} आबंध द्विध्रुवों का परिणामी एक ही दिशा में होता है',
      'फ्लोरीन की विद्युतऋणात्मकता हाइड्रोजन की तुलना में बहुत कम होती है',
      '\\ce{NF3} में नाइट्रोजन का संकरण $sp^2$ होता है जबकि \\ce{NH3} में $sp^3$ होता है',
      '\\ce{NH3} में अंतराअणुक हाइड्रोजन आबंध के कारण द्विध्रुव आघूर्ण बढ़ जाता है',
    ],
    correct_index: 0,
    explanation_hi:
      'NCERT के अनुसार, \\ce{NH3} में एकाकी युग्म के कारण कक्षीय द्विध्रुव तथा तीनों \\ce{N-H} आबंध द्विध्रुवों का परिणामी एक ही दिशा में होने से जुड़ जाते हैं। इसके विपरीत \\ce{NF3} में अत्यधिक विद्युतऋणी फ्लोरीन के कारण तीनों \\ce{N-F} आबंध द्विध्रुवों का परिणामी कक्षीय द्विध्रुव की विपरीत दिशा में होता है, जिससे कुल द्विध्रुव आघूर्ण कम हो जाता है।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000003000,
  },
  {
    id: 'starter-chem-2',
    subject: 'Chemistry',
    chapter: 'Coordination Compounds',
    difficulty: 'Hard',
    tags: ['Starter Sample', 'NCERT Line', 'Exception'],
    concept_key: 'starter-cft-strong-field-ligand-d6',
    question_hi:
      'अष्टफलकीय संकुल $[\\text{Co}(\\text{NH}_3)_6]^{3+}$ (जहाँ $\\Delta_o > P$) के लिए क्रिस्टल क्षेत्र सिद्धांत (CFT) के अनुसार सही इलेक्ट्रॉनिक विन्यास तथा चुंबकीय प्रकृति क्या है?',
    options_hi: [
      '$t_{2g}^6 e_g^0$ तथा प्रतिचुंबकीय',
      '$t_{2g}^4 e_g^2$ तथा अनुचुंबकीय',
      '$t_{2g}^5 e_g^1$ तथा अनुचुंबकीय',
      '$t_{2g}^3 e_g^3$ तथा प्रतिचुंबकीय',
    ],
    correct_index: 0,
    explanation_hi:
      '\\ce{[Co(NH3)6]^3+} में कोबाल्ट $\\text{Co}^{3+}$ ($3d^6$) अवस्था में है तथा \\ce{NH3} इसके साथ प्रबल क्षेत्र लिगैंड की तरह व्यवहार करता है ($\\Delta_o > P$)। अतः सभी 6 इलेक्ट्रॉन युग्मित होकर निम्न ऊर्जा वाले $t_{2g}$ कक्षकों में प्रवेश करते हैं ($t_{2g}^6 e_g^0$)। शून्य अयुग्मित इलेक्ट्रॉनों के कारण यह संकुल प्रतिचुंबकीय (diamagnetic) है।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000004000,
  },

  // ================= BOTANY (2) =================
  {
    id: 'starter-bot-1',
    subject: 'Botany',
    chapter: 'Photosynthesis in Higher Plants',
    difficulty: 'Medium',
    tags: ['Starter Sample', 'NCERT Line', 'Statement I & II'],
    concept_key: 'starter-c4-plants-kranz-anatomy-rubisco',
    question_hi:
      '$C_4$ पौधों में प्रकाश-संश्लेषण के संदर्भ में निम्नलिखित में से कौन-सा कथन पूर्णतः सत्य है?',
    options_hi: [
      'पर्णमध्योतक कोशिकाओं में PEPcase उपस्थित होता है जबकि RuBisCO पूलाच्छद कोशिकाओं में पाया जाता है',
      'पर्णमध्योतक कोशिकाओं में RuBisCO प्रचुर मात्रा में होता है और प्रकाश-श्वसन तीव्र गति से होता है',
      'पूलाच्छद कोशिकाओं की भित्ति पतली तथा गैसों के लिए अत्यधिक पारगम्य होती है',
      '$C_4$ पथ में प्रथम स्थायी उत्पाद $3$-फॉस्फोग्लिसरिक अम्ल (PGA) बनता है',
    ],
    correct_index: 0,
    explanation_hi:
      'NCERT कक्षा 11 के अनुसार, $C_4$ पौधों (क्रैंज शारीरिकी) में पर्णमध्योतक (mesophyll) कोशिकाओं में PEPcase एंजाइम होता है परंतु RuBisCO अनुपस्थित होता है। RuBisCO पूलाच्छद (bundle sheath) कोशिकाओं में केंद्रित रहता है जहाँ \\ce{CO2} की उच्च सांद्रता प्रकाश-श्वसन (photorespiration) को रोकती है।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000005000,
  },
  {
    id: 'starter-bot-2',
    subject: 'Botany',
    chapter: 'Molecular Basis of Inheritance',
    difficulty: 'Medium',
    tags: ['Starter Sample', 'NCERT Line'],
    concept_key: 'starter-lac-operon-inducer-lactose',
    question_hi:
      'लैक ओपेरॉन (Lac Operon) के नियमन में जब माध्यम में लैक्टोज उपस्थित होता है, तब प्रेरक (inducer) किसके साथ बंधकर अनुलेखन (transcription) को प्रारंभ करता है?',
    options_hi: [
      'दमनकारी प्रोटीन (repressor protein) के साथ बंधकर उसे निष्क्रिय कर देता है',
      'प्रचालक (operator) स्थल से सीधे जुड़कर RNA पॉलिमरेज को सक्रिय करता है',
      'उन्नायक (promoter) क्षेत्र को हटाकर संरचनात्मक जीन को खोलता है',
      'बीटा-गैलेक्टोसाइडेज एंजाइम के साथ जुड़कर DNA प्रतिकृति रोकता है',
    ],
    correct_index: 0,
    explanation_hi:
      'लैक ओपेरॉन में $i$ जीन द्वारा निर्मित दमनकारी प्रोटीन (repressor) सामान्यतः प्रचालक (operator) से जुड़कर अनुलेखन को रोकता है। लैक्टोज (या ऐलोलैक्टोज) प्रेरक के रूप में दमनकारी प्रोटीन से जुड़कर उसे निष्क्रिय कर देता है, जिससे RNA पॉलिमरेज उन्नायक से आगे बढ़कर $z, y, a$ जीनों का अनुलेखन करता है।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000006000,
  },

  // ================= ZOOLOGY (2) =================
  {
    id: 'starter-zoo-1',
    subject: 'Zoology',
    chapter: 'Breathing and Exchange of Gases',
    difficulty: 'Medium',
    tags: ['Starter Sample', 'NCERT Line', 'Diagram/Concept'],
    concept_key: 'starter-oxygen-dissociation-curve-bohr-shift',
    question_hi:
      'सक्रिय ऊतकों (tissues) में ऑक्सीहीमोग्लोबिन के वियोजन तथा ऑक्सीजन वियोजन वक्र के दाईं ओर विस्थापन (shift to right) के लिए निम्नलिखित में से कौन-सी परिस्थितियाँ अनुकूल होती हैं?',
    options_hi: [
      'निम्न $p\\text{O}_2$, उच्च $p\\text{CO}_2$, उच्च $\\text{H}^+$ सांद्रता तथा उच्च ताप',
      'उच्च $p\\text{O}_2$, निम्न $p\\text{CO}_2$, निम्न $\\text{H}^+$ सांद्रता तथा निम्न ताप',
      'उच्च $p\\text{O}_2$, उच्च $p\\text{CO}_2$, उच्च $\\text{pH}$ तथा निम्न ताप',
      'निम्न $p\\text{O}_2$, निम्न $p\\text{CO}_2$, निम्न $\\text{H}^+$ सांद्रता तथा उच्च ताप',
    ],
    correct_index: 0,
    explanation_hi:
      'ऊतकों में उपापचयी सक्रियता के कारण $p\\text{O}_2$ कम, $p\\text{CO}_2$ अधिक, $\\text{H}^+$ सांद्रता अधिक (कम $\\text{pH}$) तथा तापमान अधिक होता है। ये सभी कारक ऑक्सीहीमोग्लोबिन से ऑक्सीजन के वियोजन को बढ़ावा देते हैं और ऑक्सीजन वियोजन वक्र को दाईं ओर विस्थापित करते हैं।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000007000,
  },
  {
    id: 'starter-zoo-2',
    subject: 'Zoology',
    chapter: 'Excretory Products and their Elimination',
    difficulty: 'Hard',
    tags: ['Starter Sample', 'NCERT Line', 'Exception'],
    concept_key: 'starter-henle-loop-permeability-countercurrent',
    question_hi:
      'वृक्काणु (nephron) के हेनले पाश (Loop of Henle) की अवरोही (descending) तथा आरोही (ascending) भुजाओं की पारगम्यता के विषय में सही विकल्प चुनिए:',
    options_hi: [
      'अवरोही भुजा जल के लिए पारगम्य परंतु विद्युत-अपघट्यों के लिए लगभग अपारगम्य होती है, जबकि आरोही भुजा जल के लिए अपारगम्य होती है',
      'अवरोही भुजा जल के लिए अपारगम्य तथा \\ce{NaCl} के सक्रिय परिवहन के लिए पारगम्य होती है',
      'आरोही और अवरोही दोनों भुजाएँ जल तथा यूरिया दोनों के लिए समान रूप से पारगम्य होती हैं',
      'आरोही भुजा में निस्यंद (filtrate) नीचे जाते समय अत्यधिक सांद्रित हो जाता है',
    ],
    correct_index: 0,
    explanation_hi:
      'NCERT के अनुसार, हेनले पाश की अवरोही भुजा जल के लिए पारगम्य और विद्युत-अपघट्यों के लिए लगभग अपारगम्य होती है, जिससे निस्यंद नीचे जाते हुए सांद्रित होता है। इसके विपरीत आरोही भुजा जल के लिए अपारगम्य होती है परंतु विद्युत-अपघट्यों (\\ce{NaCl}) के सक्रिय या निष्क्रिय परिवहन की अनुमति देती है, जिससे निस्यंद तनु होता जाता है।',
    isStarred: false,
    isSaved: false,
    isStarterSample: true,
    createdAt: 1700000008000,
  },
];
