export interface Receiver {
  id: number;
  name: string;
  bank: string;
  agency: string;
  beneficiary_name: string;
  cpf: string;
  pix_key: string;
}

export interface Staff {
  id: number;
  name: string;
  role: string;
  shift: string;
  daily_rate: number;
  hours_per_day: number;
  meal_allowance: number;
  receiver_id?: number;
  receiver_name?: string;
}

export interface Attendance {
  id: number;
  staff_id: number;
  date: string; // YYYY-MM-DD
}

export interface PaymentSummary {
  staffId: number;
  name: string;
  daysWorked: number;
  hourlyRate: number;
  totalDaily: number;
  totalMeal: number;
  totalToPay: number;
  splitAmount: number; // totalToPay / 3
}
