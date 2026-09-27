import { apiClient } from '@/api/client';
import type { PaymentMethod } from '@/types/counter';
import type {
  Expense,
  ExpenseCategory,
  ExpenseCompliance,
  ExpenseDaySummary,
  ExpenseMonthSummary,
} from '@/types/expense';

const base = (businessId: string) => `/businesses/${businessId}`;

// --- Categories ------------------------------------------------------------

/**
 * `includeInactive` is for the screens that *list* spending rather than the
 * picker: a withdrawn category is still attached to expenses already logged,
 * and leaving it out would render those rows with no category at all.
 */
export async function listExpenseCategories(
  businessId: string,
  options: { includeInactive?: boolean } = {}
): Promise<ExpenseCategory[]> {
  const { data } = await apiClient.get<ExpenseCategory[]>(`${base(businessId)}/expense-categories`, {
    params: options,
  });
  return data;
}

export async function createExpenseCategory(businessId: string, name: string): Promise<ExpenseCategory> {
  const { data } = await apiClient.post<ExpenseCategory>(`${base(businessId)}/expense-categories`, { name });
  return data;
}

export async function updateExpenseCategory(
  businessId: string,
  categoryId: string,
  payload: { name?: string; isActive?: boolean }
): Promise<ExpenseCategory> {
  const { data } = await apiClient.patch<ExpenseCategory>(
    `${base(businessId)}/expense-categories/${categoryId}`,
    payload
  );
  return data;
}

// --- Logging ---------------------------------------------------------------

/**
 * `date` omitted means the BRANCH's today, decided on the server from its own
 * timezone — not the device's, which may be somewhere else entirely.
 */
export async function logExpense(
  businessId: string,
  payload: {
    branchId: string;
    categoryId: string;
    amount: number;
    date?: string;
    note?: string;
    paymentMethod?: PaymentMethod;
  }
): Promise<Expense> {
  const { data } = await apiClient.post<Expense>(`${base(businessId)}/expenses`, payload);
  return data;
}

export async function updateExpense(
  businessId: string,
  expenseId: string,
  payload: {
    categoryId?: string;
    amount?: number;
    date?: string;
    note?: string;
    paymentMethod?: PaymentMethod;
  }
): Promise<Expense> {
  const { data } = await apiClient.patch<Expense>(`${base(businessId)}/expenses/${expenseId}`, payload);
  return data;
}

export async function deleteExpense(businessId: string, expenseId: string): Promise<void> {
  await apiClient.delete(`${base(businessId)}/expenses/${expenseId}`);
}

// --- Reading ---------------------------------------------------------------

export async function getExpenseDay(
  businessId: string,
  branchId: string,
  options: { date?: string } = {}
): Promise<ExpenseDaySummary> {
  const { data } = await apiClient.get<ExpenseDaySummary>(
    `${base(businessId)}/branches/${branchId}/expense-day`,
    { params: options }
  );
  return data;
}

export async function getExpenseMonth(
  businessId: string,
  branchId: string,
  month: number,
  year: number
): Promise<ExpenseMonthSummary> {
  const { data } = await apiClient.get<ExpenseMonthSummary>(
    `${base(businessId)}/branches/${branchId}/expense-month`,
    { params: { month, year } }
  );
  return data;
}

/**
 * Who the back office has to ring.
 *
 * With no `date`, every branch is asked about its own local today — which is
 * why this cannot be computed on the device from a list of expenses.
 */
export async function getExpenseCompliance(
  businessId: string,
  options: { date?: string } = {}
): Promise<ExpenseCompliance> {
  const { data } = await apiClient.get<ExpenseCompliance>(`${base(businessId)}/expense-compliance`, {
    params: options,
  });
  return data;
}
