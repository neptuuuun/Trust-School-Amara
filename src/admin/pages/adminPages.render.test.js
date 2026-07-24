/**
 * Render smoke tests for the two pages rebuilt in the post-Chargily audit.
 *
 * These pages sit behind an admin login, so a browser check can't reach them
 * without production credentials. They are also the pages that consume the new
 * /api/admin/overview and /api/chargily/orders payloads, so a shape mismatch
 * would surface as a blank screen for the admin and nowhere else.
 *
 * What is asserted:
 *   • Overview renders every queue, and renders the calm state when nothing is
 *     pending (the two branches an admin actually sees).
 *   • Overview does not crash when the provider has no snapshot (no branch
 *     selected / failed fetch) — this was a real null-dereference risk after the
 *     page moved to shared context.
 *   • PaymentOrdersPage shows the paid-but-unseated triage banner and the
 *     human-readable failure reason, and reports branch-wide counts from the
 *     server summary rather than from the filtered page of rows.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Overview from './Overview';
import PaymentOrdersPage from './PaymentOrdersPage';
import { useAdminOverview } from '../AdminOverviewContext';
import { getPaymentOrders } from '../../services/adminOpsService';
import { useBranch } from '../../contexts/BranchContext';

jest.mock('../AdminOverviewContext', () => ({ useAdminOverview: jest.fn() }));
jest.mock('../../services/adminOpsService', () => ({
  getPaymentOrders: jest.fn(),
  resolveStuckPaymentOrder: jest.fn(),
}));
jest.mock('../../contexts/BranchContext', () => ({ useBranch: jest.fn() }));
jest.mock('../components/ToastNotifications', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

const OVERVIEW = {
  branchId: 'boumerdes',
  academicYear: '2026-2027',
  generatedAt: new Date(0).toISOString(),
  actionRequired: { documentVerification: 3, stuckPayments: 2, trainingRequests: 1, total: 6 },
  stuckPaymentsList: [
    { orderId: 'o1', studentName: 'أمين', serviceType: 'support', amount: 1500, reason: 'class-full', paidAt: null },
  ],
  students: { total: 40, verified: 35, pendingDocs: 3, other: 2 },
  revenue: { today: 2000, month: 40000, paidOrdersToday: 2, awaitingPayment: 1, window: 120 },
  support: { active: 12, expiringSoon: 4, expired: 3, expiringList: [{ id: 's1', studentName: 'سارة', subjectName: 'رياضيات', endDate: null }] },
  catalog: { subjects: { language: 2, support: 8, training: 1 }, classes: 11, classesFull: 1, seatsFree: 129 },
  annualFees: { paidThisYear: 7 },
};

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Overview', () => {
  it('renders each action queue with its count', () => {
    useAdminOverview.mockReturnValue({ data: OVERVIEW, loading: false, refreshing: false, error: '', refresh: jest.fn() });
    renderWithRouter(<Overview />);

    expect(screen.getByText('مدفوعات عالقة')).toBeInTheDocument();
    expect(screen.getByText('وثائق بانتظار المراجعة')).toBeInTheDocument();
    expect(screen.getByText('طلبات دورات تكوينية')).toBeInTheDocument();
    expect(screen.getByText('اشتراكات دعم تنتهي قريباً')).toBeInTheDocument();
    // The stuck-payment reason must be shown in words, not as a raw error code.
    expect(screen.getByText(/اكتمل العدد في المجموعة/)).toBeInTheDocument();
    expect(screen.queryByText('class-full')).not.toBeInTheDocument();
  });

  it('shows the all-clear state when nothing is pending', () => {
    useAdminOverview.mockReturnValue({
      data: {
        ...OVERVIEW,
        actionRequired: { documentVerification: 0, stuckPayments: 0, trainingRequests: 0, total: 0 },
        stuckPaymentsList: [],
        support: { ...OVERVIEW.support, expiringSoon: 0, expiringList: [] },
      },
      loading: false, refreshing: false, error: '', refresh: jest.fn(),
    });
    renderWithRouter(<Overview />);

    expect(screen.getByText('لا يوجد ما ينتظر إجراءً منك')).toBeInTheDocument();
    expect(screen.queryByText('مدفوعات عالقة')).not.toBeInTheDocument();
  });

  it('does not crash when the provider has no snapshot', () => {
    useAdminOverview.mockReturnValue({ data: null, loading: false, refreshing: false, error: '', refresh: jest.fn() });
    renderWithRouter(<Overview />);
    expect(screen.getByText(/يرجى اختيار الفرع/)).toBeInTheDocument();
  });
});

describe('PaymentOrdersPage', () => {
  beforeEach(() => {
    useBranch.mockReturnValue({ selectedBranchId: 'boumerdes', branches: [] });
  });

  it('surfaces stuck payments and uses the server summary for the headline counts', async () => {
    getPaymentOrders.mockResolvedValue({
      orders: [
        {
          orderId: 'o1', studentName: 'أمين', studentEmail: 'a@x.com', serviceType: 'support',
          serviceData: { serviceName: 'رياضيات' }, amount: 1500, paymentMethod: 'chargily',
          status: 'paid', needsAttention: true, registrationError: 'schedule-conflict', createdAt: null,
        },
      ],
      // Deliberately inconsistent with `orders` above: the page must report the
      // branch-wide summary, not recount the single row it happens to be showing.
      summary: { total: 9, paid: 7, pending: 1, failed: 1, needsAttention: 3 },
      truncated: false,
    });

    renderWithRouter(<PaymentOrdersPage />);

    // The row appears twice by design: the desktop table and the mobile card
    // list are both in the DOM, hidden from each other only by CSS.
    await waitFor(() => expect(screen.getAllByText('أمين').length).toBeGreaterThan(0));
    expect(screen.getByText('3 عملية دفع تحتاج تدخلاً')).toBeInTheDocument();
    expect(screen.getAllByText(/تعارض في التوقيت/).length).toBeGreaterThan(0);

    // Branch-wide "paid" count comes from the summary (7), not from the single
    // row currently rendered — the bug this page previously had.
    const paidCard = screen.getByText('عمليات دفع ناجحة').closest('div').parentElement;
    expect(paidCard).toHaveTextContent('7');
  });

  it('renders a clean empty state when no order needs attention', async () => {
    getPaymentOrders.mockResolvedValue({
      orders: [],
      summary: { total: 4, paid: 4, pending: 0, failed: 0, needsAttention: 0 },
      truncated: false,
    });

    renderWithRouter(<PaymentOrdersPage />);

    await waitFor(() => expect(screen.getByText('لا توجد عمليات دفع')).toBeInTheDocument());
    // No triage banner and no "تحتاج تدخلاً" filter pill when the queue is empty
    // (the stat card of the same name still renders, showing 0).
    expect(screen.queryByText(/عملية دفع تحتاج تدخلاً/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تحتاج تدخلاً/ })).not.toBeInTheDocument();
  });
});
