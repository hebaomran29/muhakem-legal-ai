/* ─────────────────────────────────────────────────────────────
   أنواع بيانات الملف المهني اللي بتتجمع في خطوات إنشاء الحساب
   (AuthOnboarding). القيم دي بتتخزن في user_metadata بتاعة
   Supabase (عن طريق completeOnboarding في auth.tsx) — مفيش
   جداول داتابيز منفصلة ليها لسه.
   ───────────────────────────────────────────────────────────── */

export type Gender = 'male' | 'female';

export type Language = 'ar' | 'en';

export type LegalRole = 'lawyer' | 'legal_consultant' | 'legal_researcher' | 'law_student';

export type YearsOfExperience = 'less_than_1' | '1_to_3' | '3_to_5' | '5_to_10' | 'more_than_10';

export type LegalSpecialization =
  | 'criminal'
  | 'civil'
  | 'commercial'
  | 'labor'
  | 'personal_status'
  | 'corporate'
  | 'contracts'
  | 'administrative'
  | 'investment';

export type StudyLevel = 'student' | 'recent_grad' | 'postgrad';

export type OnboardingProfile = {
  fullName: string;
  age?: string;
  gender?: Gender;
  language: Language;
  role?: LegalRole;
  yearsOfExperience?: YearsOfExperience;
  legalSpecializations: LegalSpecialization[];
  studyLevel?: StudyLevel;
};
