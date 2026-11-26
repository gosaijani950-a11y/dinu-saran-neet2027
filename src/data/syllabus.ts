import type { ChapterItem, CoreSubject } from '../types';

export const CORE_SUBJECTS: CoreSubject[] = ['Physics', 'Chemistry', 'Botany', 'Zoology'];

export const NEET_2027_SYLLABUS: ChapterItem[] = [
  // ===================== PHYSICS — CLASS 11 =====================
  { id: 'phy-11-1', subject: 'Physics', classLevel: 'Class 11', unit: 'Mechanics', name: 'Units and Measurements' },
  { id: 'phy-11-2', subject: 'Physics', classLevel: 'Class 11', unit: 'Mechanics', name: 'Motion in a Straight Line' },
  { id: 'phy-11-3', subject: 'Physics', classLevel: 'Class 11', unit: 'Mechanics', name: 'Motion in a Plane' },
  { id: 'phy-11-4', subject: 'Physics', classLevel: 'Class 11', unit: 'Mechanics', name: 'Laws of Motion' },
  { id: 'phy-11-5', subject: 'Physics', classLevel: 'Class 11', unit: 'Mechanics', name: 'Work, Energy and Power' },
  { id: 'phy-11-6', subject: 'Physics', classLevel: 'Class 11', unit: 'Mechanics', name: 'System of Particles and Rotational Motion' },
  { id: 'phy-11-7', subject: 'Physics', classLevel: 'Class 11', unit: 'Mechanics', name: 'Gravitation' },
  { id: 'phy-11-8', subject: 'Physics', classLevel: 'Class 11', unit: 'Properties of Matter', name: 'Mechanical Properties of Solids' },
  { id: 'phy-11-9', subject: 'Physics', classLevel: 'Class 11', unit: 'Properties of Matter', name: 'Mechanical Properties of Fluids' },
  { id: 'phy-11-10', subject: 'Physics', classLevel: 'Class 11', unit: 'Thermodynamics', name: 'Thermal Properties of Matter' },
  { id: 'phy-11-11', subject: 'Physics', classLevel: 'Class 11', unit: 'Thermodynamics', name: 'Thermodynamics (Physics)' },
  { id: 'phy-11-12', subject: 'Physics', classLevel: 'Class 11', unit: 'Thermodynamics', name: 'Kinetic Theory of Gases' },
  { id: 'phy-11-13', subject: 'Physics', classLevel: 'Class 11', unit: 'Oscillations & Waves', name: 'Oscillations' },
  { id: 'phy-11-14', subject: 'Physics', classLevel: 'Class 11', unit: 'Oscillations & Waves', name: 'Waves' },

  // ===================== PHYSICS — CLASS 12 =====================
  { id: 'phy-12-1', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Electric Charges and Fields' },
  { id: 'phy-12-2', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Electrostatic Potential and Capacitance' },
  { id: 'phy-12-3', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Current Electricity' },
  { id: 'phy-12-4', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Moving Charges and Magnetism' },
  { id: 'phy-12-5', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Magnetism and Matter' },
  { id: 'phy-12-6', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Electromagnetic Induction' },
  { id: 'phy-12-7', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Alternating Current' },
  { id: 'phy-12-8', subject: 'Physics', classLevel: 'Class 12', unit: 'Electromagnetism', name: 'Electromagnetic Waves' },
  { id: 'phy-12-9', subject: 'Physics', classLevel: 'Class 12', unit: 'Optics', name: 'Ray Optics and Optical Instruments' },
  { id: 'phy-12-10', subject: 'Physics', classLevel: 'Class 12', unit: 'Optics', name: 'Wave Optics' },
  { id: 'phy-12-11', subject: 'Physics', classLevel: 'Class 12', unit: 'Modern Physics', name: 'Dual Nature of Radiation and Matter' },
  { id: 'phy-12-12', subject: 'Physics', classLevel: 'Class 12', unit: 'Modern Physics', name: 'Atoms' },
  { id: 'phy-12-13', subject: 'Physics', classLevel: 'Class 12', unit: 'Modern Physics', name: 'Nuclei' },
  { id: 'phy-12-14', subject: 'Physics', classLevel: 'Class 12', unit: 'Modern Physics', name: 'Semiconductor Electronics & Experimental Skills' },

  // ===================== CHEMISTRY — PHYSICAL =====================
  { id: 'chem-p-1', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Physical Chemistry', name: 'Some Basic Concepts of Chemistry' },
  { id: 'chem-p-2', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Physical Chemistry', name: 'Structure of Atom' },
  { id: 'chem-p-3', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Physical Chemistry', name: 'Chemical Thermodynamics' },
  { id: 'chem-p-4', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Physical Chemistry', name: 'Equilibrium' },
  { id: 'chem-p-5', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Physical Chemistry', name: 'Redox Reactions' },
  { id: 'chem-p-6', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Physical Chemistry', name: 'Solutions' },
  { id: 'chem-p-7', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Physical Chemistry', name: 'Electrochemistry' },
  { id: 'chem-p-8', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Physical Chemistry', name: 'Chemical Kinetics' },

  // ===================== CHEMISTRY — INORGANIC =====================
  { id: 'chem-i-1', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Inorganic Chemistry', name: 'Classification of Elements and Periodicity in Properties' },
  { id: 'chem-i-2', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Inorganic Chemistry', name: 'Chemical Bonding and Molecular Structure' },
  { id: 'chem-i-3', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Inorganic Chemistry', name: 'The p-Block Elements (Groups 13 to 18)' },
  { id: 'chem-i-4', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Inorganic Chemistry', name: 'The d- and f-Block Elements' },
  { id: 'chem-i-5', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Inorganic Chemistry', name: 'Coordination Compounds' },

  // ===================== CHEMISTRY — ORGANIC =====================
  { id: 'chem-o-1', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Organic Chemistry', name: 'Organic Chemistry: Some Basic Principles and Techniques (GOC)' },
  { id: 'chem-o-2', subject: 'Chemistry', classLevel: 'Class 11', unit: 'Organic Chemistry', name: 'Hydrocarbons' },
  { id: 'chem-o-3', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Organic Chemistry', name: 'Haloalkanes and Haloarenes' },
  { id: 'chem-o-4', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Organic Chemistry', name: 'Alcohols, Phenols and Ethers' },
  { id: 'chem-o-5', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Organic Chemistry', name: 'Aldehydes, Ketones and Carboxylic Acids' },
  { id: 'chem-o-6', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Organic Chemistry', name: 'Amines' },
  { id: 'chem-o-7', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Organic Chemistry', name: 'Biomolecules (Chemistry)' },
  { id: 'chem-o-8', subject: 'Chemistry', classLevel: 'Class 12', unit: 'Organic Chemistry', name: 'Principles Related to Practical Chemistry' },

  // ===================== BOTANY — CLASS 11 =====================
  { id: 'bot-11-1', subject: 'Botany', classLevel: 'Class 11', unit: 'Diversity', name: 'The Living World' },
  { id: 'bot-11-2', subject: 'Botany', classLevel: 'Class 11', unit: 'Diversity', name: 'Biological Classification' },
  { id: 'bot-11-3', subject: 'Botany', classLevel: 'Class 11', unit: 'Diversity', name: 'Plant Kingdom' },
  { id: 'bot-11-4', subject: 'Botany', classLevel: 'Class 11', unit: 'Structural Organisation', name: 'Morphology of Flowering Plants' },
  { id: 'bot-11-5', subject: 'Botany', classLevel: 'Class 11', unit: 'Structural Organisation', name: 'Anatomy of Flowering Plants' },
  { id: 'bot-11-6', subject: 'Botany', classLevel: 'Class 11', unit: 'Cell Biology', name: 'Cell: The Unit of Life' },
  { id: 'bot-11-7', subject: 'Botany', classLevel: 'Class 11', unit: 'Cell Biology', name: 'Cell Cycle and Cell Division' },
  { id: 'bot-11-8', subject: 'Botany', classLevel: 'Class 11', unit: 'Plant Physiology', name: 'Photosynthesis in Higher Plants' },
  { id: 'bot-11-9', subject: 'Botany', classLevel: 'Class 11', unit: 'Plant Physiology', name: 'Respiration in Plants' },
  { id: 'bot-11-10', subject: 'Botany', classLevel: 'Class 11', unit: 'Plant Physiology', name: 'Plant Growth and Development' },

  // ===================== BOTANY — CLASS 12 =====================
  { id: 'bot-12-1', subject: 'Botany', classLevel: 'Class 12', unit: 'Reproduction', name: 'Sexual Reproduction in Flowering Plants' },
  { id: 'bot-12-2', subject: 'Botany', classLevel: 'Class 12', unit: 'Genetics', name: 'Principles of Inheritance and Variation' },
  { id: 'bot-12-3', subject: 'Botany', classLevel: 'Class 12', unit: 'Genetics', name: 'Molecular Basis of Inheritance' },
  { id: 'bot-12-4', subject: 'Botany', classLevel: 'Class 12', unit: 'Biology in Human Welfare', name: 'Microbes in Human Welfare' },
  { id: 'bot-12-5', subject: 'Botany', classLevel: 'Class 12', unit: 'Ecology', name: 'Organisms and Populations' },
  { id: 'bot-12-6', subject: 'Botany', classLevel: 'Class 12', unit: 'Ecology', name: 'Ecosystem' },
  { id: 'bot-12-7', subject: 'Botany', classLevel: 'Class 12', unit: 'Ecology', name: 'Biodiversity and Conservation' },

  // ===================== ZOOLOGY — CLASS 11 =====================
  { id: 'zoo-11-1', subject: 'Zoology', classLevel: 'Class 11', unit: 'Animal Diversity', name: 'Animal Kingdom' },
  { id: 'zoo-11-2', subject: 'Zoology', classLevel: 'Class 11', unit: 'Structural Organisation', name: 'Structural Organisation in Animals (Animal Tissues & Frog)' },
  { id: 'zoo-11-3', subject: 'Zoology', classLevel: 'Class 11', unit: 'Cell Biology', name: 'Biomolecules (Biology)' },
  { id: 'zoo-11-4', subject: 'Zoology', classLevel: 'Class 11', unit: 'Human Physiology', name: 'Breathing and Exchange of Gases' },
  { id: 'zoo-11-5', subject: 'Zoology', classLevel: 'Class 11', unit: 'Human Physiology', name: 'Body Fluids and Circulation' },
  { id: 'zoo-11-6', subject: 'Zoology', classLevel: 'Class 11', unit: 'Human Physiology', name: 'Excretory Products and their Elimination' },
  { id: 'zoo-11-7', subject: 'Zoology', classLevel: 'Class 11', unit: 'Human Physiology', name: 'Locomotion and Movement' },
  { id: 'zoo-11-8', subject: 'Zoology', classLevel: 'Class 11', unit: 'Human Physiology', name: 'Neural Control and Coordination' },
  { id: 'zoo-11-9', subject: 'Zoology', classLevel: 'Class 11', unit: 'Human Physiology', name: 'Chemical Coordination and Integration' },

  // ===================== ZOOLOGY — CLASS 12 =====================
  { id: 'zoo-12-1', subject: 'Zoology', classLevel: 'Class 12', unit: 'Reproduction', name: 'Human Reproduction' },
  { id: 'zoo-12-2', subject: 'Zoology', classLevel: 'Class 12', unit: 'Reproduction', name: 'Reproductive Health' },
  { id: 'zoo-12-3', subject: 'Zoology', classLevel: 'Class 12', unit: 'Evolution', name: 'Evolution' },
  { id: 'zoo-12-4', subject: 'Zoology', classLevel: 'Class 12', unit: 'Human Health', name: 'Human Health and Disease' },
  { id: 'zoo-12-5', subject: 'Zoology', classLevel: 'Class 12', unit: 'Biotechnology', name: 'Biotechnology: Principles and Processes' },
  { id: 'zoo-12-6', subject: 'Zoology', classLevel: 'Class 12', unit: 'Biotechnology', name: 'Biotechnology and its Applications' },
];

export function getChaptersBySubject(subject: string): ChapterItem[] {
  if (subject === 'All') return NEET_2027_SYLLABUS;
  return NEET_2027_SYLLABUS.filter((c) => c.subject === subject);
}
