 import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import {
  AlertCircle, ArrowLeft, ArrowRight, Bell, Building2, Check, CheckCircle2,
  ChevronDown, ClipboardList, Clock3, FileCheck2, FileText, Filter,
  History, LayoutDashboard, LifeBuoy, ListFilter, LockKeyhole, LogIn, LogOut,
  Menu, Pencil, Plus, Search, Send, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, UserRound, Users, X, type LucideIcon,
} from 'lucide-react';
import {
  GrievanceStatus, UserRole, getGetAdminGrievanceQueryKey,
  getGetCurrentUserQueryKey, getGetMyConsentQueryKey, getGetMyGrievanceQueryKey, getGetOfficerGrievanceQueryKey,
  getListMyConsentsQueryKey,
  getListCategoriesQueryKey, getListMyGrievancesQueryKey,
  getListNotificationsQueryKey, getListUsersQueryKey, useAcceptResolution, useAddAdminResolution,
  useAddOfficerResolution, useAdminChangeStatus, useAssignGrievance, useCreateCategory,
  useCreateConsent, useCreateGrievance, useCreateOfficer, useDeactivateCategory, useGetAdminDashboard,
  useGetAdminGrievance, useGetCurrentUser, useGetMyConsent, useGetMyGrievance,
  useGetOfficerDashboard, useGetOfficerGrievance, useListAdminGrievances, useListAuditLogs,
  useListCategories, useListMyConsents, useListMyGrievances, useListNotifications, useListOfficerGrievances,
  useListUsers, useLogin, useLogout, useMarkAllNotificationsRead, useMarkNotificationRead,
  useOfficerChangeStatus, useRegister, useSetUserActive, useUpdateCategory, useUpdateCurrentUser,
} from '@workspace/api-client-react';
import type { Consent, Grievance, GrievanceDetail, GrievanceStatus as GrievanceStatusType } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();

const statusMeta: Record<string, { label: string; tone: string; icon: LucideIcon }> = {
  SUBMITTED: { label: 'Submitted', tone: 'bg-[#e7eef2] text-[#31566a]', icon: Send },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'bg-[#e7f0eb] text-[#2e6959]', icon: CheckCircle2 },
  ASSIGNED: { label: 'Assigned', tone: 'bg-[#f3ead3] text-[#806327]', icon: ClipboardList },
  IN_PROGRESS: { label: 'In progress', tone: 'bg-[#dcebf0] text-[#276176]', icon: Clock3 },
  RESOLVED: { label: 'Resolved', tone: 'bg-[#e5efe6] text-[#377044]', icon: FileCheck2 },
  CLOSED: { label: 'Closed', tone: 'bg-[#e9e8e2] text-[#606760]', icon: ShieldCheck },
};

function StatusBadge({ status }: { status?: string }) {
  const meta = statusMeta[status || 'SUBMITTED'] || statusMeta.SUBMITTED;
  const Icon = meta.icon;
  return <span data-testid={`status-${status || 'unknown'}`} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-bold tracking-wide ${meta.tone}`}><Icon size={12} />{meta.label}</span>;
}

function Logo({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" data-testid="link-logo" className={`flex items-center gap-2.5 ${inverse ? 'text-white' : 'text-[#172333]'}`}>
    <span className={`relative grid h-10 w-10 place-items-center rounded-[3px] ${inverse ? 'bg-[#078dca] text-white' : 'bg-[#078dca] text-white'}`}><ShieldCheck size={25} strokeWidth={2.5} /><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#0d1830]" /></span>
    <span className="leading-none"><strong className="block text-[17px] font-extrabold tracking-[-.06em]">DPDP <span className="text-[#078dca]">CONSULTANTS</span></strong><small className={`mt-1 block text-[9px] font-bold uppercase tracking-[.16em] ${inverse ? 'text-slate-300' : 'text-[#72808d]'}`}>Grievance portal</small></span>
  </Link>;
}

type ServiceKey = 'NEWSLETTER' | 'ACCOUNT' | 'SUPPORT';
type ServiceConfig = {
  key: ServiceKey;
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  notice: string;
};
const serviceConfigs: ServiceConfig[] = [
  {
    key: 'NEWSLETTER',
    slug: 'newsletter',
    title: 'Newsletter',
    description: 'Receive practical updates, product news, events, and industry insights.',
    icon: FileText,
    notice: 'By choosing Newsletter, you agree that DPDP Consultants may use your name, email address, and phone number to send you newsletters, product updates, events, industry news, and best practices. You can withdraw this consent at any time from your Consents & Requests dashboard.',
  },
  {
    key: 'ACCOUNT',
    slug: 'account',
    title: 'Account',
    description: 'Keep your resident profile and service records together in one secure place.',
    icon: UserRound,
    notice: 'By choosing Account, you agree that DPDP Consultants may use your name, email address, and phone number to create and maintain your resident account and send account-related service communications and product updates. You can withdraw this consent at any time from your Consents & Requests dashboard.',
  },
  {
    key: 'SUPPORT',
    slug: 'support',
    title: 'Support',
    description: 'Get guidance from the team when you need help with a service or concern.',
    icon: LifeBuoy,
    notice: 'By choosing Support, you agree that DPDP Consultants may use your name, email address, and phone number to respond to your support request, provide service guidance, and send relevant support and product updates. You can withdraw this consent at any time from your Consents & Requests dashboard.',
  },
];
const pendingServiceStorageKey = 'gms_pending_service_consent';
type PendingServiceSubmission = { service: ServiceKey; name: string; email: string; phone: string; consentAccepted: true };
const readPendingService = (): PendingServiceSubmission | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(pendingServiceStorageKey) || 'null') as Partial<PendingServiceSubmission> | null;
    if (value?.service && value.name && value.email && value.phone && value.consentAccepted) return value as PendingServiceSubmission;
  } catch {
    window.sessionStorage.removeItem(pendingServiceStorageKey);
  }
  return null;
};
const clearPendingService = () => {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(pendingServiceStorageKey);
};
const postAuthLocation = (role: string) => {
  const pending = readPendingService();
  if (pending && role === UserRole.USER) return `/services/${pending.service.toLowerCase()}`;
  return role === UserRole.ADMIN ? '/admin' : role === UserRole.OFFICER ? '/officer' : '/account';
};

function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'outline' | 'danger'; 'data-testid'?: string }) {
  const styles = {
    primary: 'bg-[#078dca] text-white shadow-none hover:bg-[#0679ae]',
    quiet: 'bg-[#eef3f6] text-[#26384a] hover:bg-[#e0e9ee]',
    outline: 'border border-[#c8d3da] bg-white text-[#26384a] hover:border-[#078dca] hover:bg-[#f1fbfd]',
    danger: 'bg-[#b54743] text-white hover:bg-[#963b38]',
  };
  return <button {...props} data-testid={props['data-testid']} className={`focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded px-4 text-sm font-bold ${styles[variant]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>{children}</button>;
}

function Field({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return <label className="block" data-testid={`field-${props.name || label.toLowerCase().replaceAll(' ', '-')}`}>
    <span className="mb-1.5 block text-xs font-bold text-[#43515d]">{label}</span>
    <input {...props} className={`focus-ring h-10 w-full rounded border border-[#cbd6dc] bg-white px-3 text-sm text-[#172333] outline-none placeholder:text-[#9aa5a0] focus:border-[#078dca] ${props.className || ''}`} />
    {hint && <span className="mt-1.5 block text-xs text-[#71817e]">{hint}</span>}
  </label>;
}

function TextField({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return <label className="block" data-testid={`field-${props.name || label.toLowerCase().replaceAll(' ', '-')}`}>
    <span className="mb-1.5 block text-xs font-bold text-[#43515d]">{label}</span>
    <textarea {...props} className={`focus-ring min-h-32 w-full resize-y rounded border border-[#cbd6dc] bg-white px-3 py-3 text-sm text-[#172333] outline-none placeholder:text-[#9aa5a0] focus:border-[#078dca] ${props.className || ''}`} />
  </label>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4 page-enter">
    <div><p className="mono-type mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#078dca]">{eyebrow || 'Grievance Management System'}</p><h1 data-testid="text-page-title" className="display-type text-3xl font-extrabold text-[#172333] sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#53616c]">{description}</p>}</div>
    {action}
  </div>;
}

function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div data-testid="loading-state" className="space-y-3">{Array.from({ length: rows }).map((_, index) => <div key={index} className="skeleton h-[72px] w-full" />)}</div>;
}

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div data-testid="error-state" className="rounded-2xl border border-[#e7c8c2] bg-[#fff4f0] p-8 text-center"><AlertCircle className="mx-auto mb-3 text-[#a9473f]" /><h3 className="font-bold text-[#653a37]">We could not load this view</h3><p className="mt-1 text-sm text-[#815956]">Your information is safe. Try again in a moment.</p>{onRetry && <Button variant="outline" className="mt-5" onClick={onRetry} data-testid="button-retry">Try again</Button>}</div>;
}

function EmptyState({ icon: Icon = FileText, title, text, action }: { icon?: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return <div data-testid="empty-state" className="rounded-2xl border border-dashed border-[#cfd5cf] bg-[#faf9f4] px-6 py-14 text-center"><span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#e6efec] text-[#376d6d]"><Icon size={22} /></span><h3 className="font-bold text-[#315467]">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#71817e]">{text}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl bg-[#203c49] px-4 py-3 text-sm font-semibold text-[#fffdf8] shadow-xl page-enter" data-testid="toast-message"><CheckCircle2 size={18} className="text-[#edc477]" />{message}<button onClick={onClose} data-testid="button-close-toast" className="ml-2 text-[#aec1c1] hover:text-white"><X size={16} /></button></div>;
}

type NavItem = { href: string; label: string; icon: LucideIcon };
const citizenNav: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/grievances', label: 'My grievances', icon: FileText },
  { href: '/consents', label: 'Consents & requests', icon: ClipboardList },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Profile', icon: UserRound },
];
const adminNav: NavItem[] = [
  { href: '/admin', label: 'Operations', icon: LayoutDashboard },
  { href: '/admin/grievances', label: 'All grievances', icon: ClipboardList },
  { href: '/admin/users', label: 'People & officers', icon: Users },
  { href: '/admin/categories', label: 'Categories', icon: ListFilter },
  { href: '/admin/audit-logs', label: 'Audit history', icon: History },
];
const officerNav: NavItem[] = [
  { href: '/officer', label: 'My workspace', icon: LayoutDashboard },
  { href: '/officer/grievances', label: 'Assigned queue', icon: ClipboardList },
];

function AppShell({ children, mode = 'citizen' }: { children: React.ReactNode; mode?: 'citizen' | 'admin' | 'officer' }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { data: user } = useGetCurrentUser();
  const logout = useLogout();
  const nav = mode === 'admin' ? adminNav : mode === 'officer' ? officerNav : citizenNav;
  const initials = (user?.name || (mode === 'admin' ? 'Admin team' : 'Resident')).split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const section = mode === 'admin' ? 'Administration' : mode === 'officer' ? 'Officer workspace' : 'Resident services';
  const handleLogout = () => logout.mutate(undefined, {
    onSuccess: () => {
      queryClient.clear();
      setAccountOpen(false);
      setMobileOpen(false);
      setLocation('/login');
    },
  });
  return <div className="min-h-[100dvh] bg-[#f4f6f8] text-[#172333]">
    <header className="sticky top-0 z-30 border-t-[3px] border-[#0d1830] border-b border-[#dce3e7] bg-white">
      <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="hidden items-center gap-1 lg:flex">
          {nav.map(({ href, label, icon: Icon }) => { const active = location === href || (href !== '/admin' && href !== '/officer' && location.startsWith(`${href}/`)); return <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`flex items-center gap-2 border-b-2 px-3 py-6 text-xs font-bold ${active ? 'border-[#078dca] text-[#078dca]' : 'border-transparent text-[#53616c] hover:text-[#078dca]'}`}><Icon size={15} />{label}</Link>; })}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/notifications" data-testid="link-header-notifications" className="relative rounded p-2 text-[#53616c] hover:bg-[#eef8fb]"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#078dca]" /></Link>
          <button onClick={() => setMobileOpen((open) => !open)} data-testid="button-open-nav" className="rounded p-2 text-[#53616c] hover:bg-[#eef8fb] lg:hidden"><Menu size={19} /></button>
          <span className="hidden h-6 w-px bg-[#dce3e7] sm:block" />
          <div className="relative">
            <button onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen} aria-haspopup="menu" data-testid="button-account-menu" className="flex items-center gap-2 rounded px-1 py-1 text-left hover:bg-[#f2f7f9]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#e6f5fa] text-[11px] font-bold text-[#078dca]">{initials}</span><span className="hidden text-right sm:block"><strong className="block text-xs">{user?.name || 'Guest session'}</strong><small className="text-[10px] text-[#72808d]">{user?.department || section}</small></span><ChevronDown size={13} className={`text-[#72808d] transition-transform ${accountOpen ? 'rotate-180' : ''}`} /></button>
            {accountOpen && <div role="menu" className="absolute right-0 top-11 z-40 min-w-44 rounded border border-[#dce3e7] bg-white p-1 shadow-lg">
              <Link href="/profile" onClick={() => setAccountOpen(false)} role="menuitem" data-testid="link-account-profile" className="block rounded px-3 py-2.5 text-xs font-semibold text-[#344554] hover:bg-[#eef8fb]">My profile</Link>
              <button onClick={handleLogout} disabled={logout.isPending} role="menuitem" data-testid="button-logout" className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-xs font-bold text-[#b54743] hover:bg-[#fff4f0]">{logout.isPending ? 'Signing out…' : <><LogOut size={14} />Sign out</>}</button>
            </div>}
          </div>
        </div>
      </div>
      {mobileOpen && <nav className="border-t border-[#dce3e7] bg-white px-5 py-2 lg:hidden" aria-label="Primary navigation">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className="flex items-center gap-2 border-b border-[#eef1f3] py-3 text-sm font-semibold text-[#344554]"><Icon size={16} />{label}</Link>)}<Link href="/profile" onClick={() => setMobileOpen(false)} data-testid="link-mobile-profile" className="flex items-center gap-2 border-b border-[#eef1f3] py-3 text-sm font-semibold text-[#344554]"><UserRound size={16} />My profile</Link><button onClick={handleLogout} disabled={logout.isPending} data-testid="button-logout" className="flex items-center gap-2 py-3 text-sm font-semibold text-[#b54743]"><LogOut size={16} />{logout.isPending ? 'Signing out…' : 'Sign out'}</button></nav>}
    </header>
    <main className="mx-auto min-h-[calc(100dvh-132px)] max-w-[1400px] px-5 py-7 sm:px-8 lg:px-10">
      <div className="mb-6 flex items-center gap-2 text-xs text-[#72808d]"><Link href={mode === 'admin' ? '/admin' : mode === 'officer' ? '/officer' : '/dashboard'} className="font-semibold text-[#078dca]">Home</Link><span>/</span><span>{section}</span></div>
      {children}
    </main>
    <footer className="bg-[#0d1830] px-5 py-5 text-center text-xs text-[#c3ced8]">Copyright 2026 · Grievance Management System</footer>
  </div>;
}

function PortalLanding() {
  return <div className="min-h-[100dvh] bg-[#f4f6f8] text-[#172333]">
    <header className="border-t-[3px] border-[#0d1830] border-b border-[#dce3e7] bg-white">
      <div className="mx-auto flex h-[70px] max-w-[1400px] items-center justify-between px-5 sm:px-8"><Logo /><div className="flex items-center gap-2"><Link href="/login" data-testid="link-login-header" className="rounded px-3 py-2 text-xs font-bold text-[#344554] hover:bg-[#eef8fb]">Sign in</Link><Link href="/register" data-testid="link-register-header" className="rounded bg-[#078dca] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0679ae]">Create account</Link></div></div>
    </header>
    <main className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:px-12">
      <div className="mb-10 text-xs text-[#72808d]"><span className="font-semibold text-[#078dca]">Home</span><span className="mx-2">/</span>Public grievance services</div>
      <section className="grid items-center gap-10 border-b border-[#dce3e7] pb-14 lg:grid-cols-[1.1fr_.9fr]">
        <div className="max-w-2xl"><p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-[#078dca]">Grievance Management System</p><h1 className="display-type text-4xl font-extrabold leading-tight sm:text-6xl">Your concern deserves a clear response.</h1><p className="mt-5 max-w-xl text-base leading-7 text-[#53616c]">Submit a grievance, follow its status, and keep a reliable record of every update from the service team.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/register" data-testid="link-start-concern" className="inline-flex items-center gap-2 rounded bg-[#078dca] px-5 py-3 text-sm font-bold text-white hover:bg-[#0679ae]">Submit a grievance <ArrowRight size={16} /></Link><Link href="/login" data-testid="link-track-concern" className="inline-flex items-center gap-2 rounded border border-[#c8d3da] bg-white px-5 py-3 text-sm font-bold text-[#26384a] hover:border-[#078dca]">Track an existing grievance</Link></div></div>
        <div className="border border-[#c8d3da] bg-white p-5 shadow-[0_10px_25px_rgba(13,24,48,.06)]"><div className="flex items-center justify-between border-b border-[#e3e8eb] pb-4"><span className="text-xs font-bold text-[#344554]">Service request status</span><span className="rounded bg-[#e6f5fa] px-2 py-1 text-[10px] font-bold text-[#078dca]">LIVE RECORD</span></div><div className="py-6"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#72808d]">Reference number</p><p className="mono-type mt-2 text-xl font-bold text-[#0d1830]">GRV-2026-01872</p><p className="mt-5 text-sm font-bold text-[#172333]">Streetlight outage on Mango Avenue</p><p className="mt-1 text-xs text-[#72808d]">Public lighting · North district</p></div><div className="grid grid-cols-4 gap-1 border-t border-[#e3e8eb] pt-5 text-center text-[10px] text-[#53616c]"><span><i className="mx-auto mb-2 block h-3 w-3 rounded-full bg-[#078dca]" />Submitted</span><span><i className="mx-auto mb-2 block h-3 w-3 rounded-full bg-[#078dca]" />Reviewed</span><span><i className="mx-auto mb-2 block h-3 w-3 rounded-full bg-[#078dca]" />Assigned</span><span><i className="mx-auto mb-2 block h-3 w-3 rounded-full bg-[#d6e0e5]" />Resolved</span></div></div>
      </section>
      <section className="border-b border-[#dce3e7] py-14" id="services"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#078dca]">Choose a service</p><h2 className="display-type mt-2 text-3xl font-bold text-[#203c49] sm:text-4xl">Stay informed, supported, and in control.</h2></div><p className="max-w-md text-sm leading-6 text-[#627471]">Tell us how you would like to engage. We’ll record your choice with the notice you accepted.</p></div><div className="grid gap-4 md:grid-cols-3">{serviceConfigs.map((service) => { const Icon = service.icon; return <Link key={service.key} href={`/services/${service.slug}`} data-testid={`link-service-${service.slug}`} className="group rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-5 shadow-[0_3px_0_#e4e1d8] transition hover:-translate-y-1 hover:border-[#3f7673] hover:shadow-[0_7px_0_#d5d1c5]"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e3efec] text-[#3f7673] transition group-hover:bg-[#3f7673] group-hover:text-white"><Icon size={21} /></span><h3 className="mt-5 text-lg font-bold text-[#315467]">{service.title}</h3><p className="mt-2 text-sm leading-6 text-[#71817e]">{service.description}</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#3f7673]">Choose {service.title} <ArrowRight size={14} /></span></Link>; })}</div></section>
      <section className="grid gap-5 py-12 md:grid-cols-3"><div className="border-l-4 border-[#078dca] bg-white p-5"><span className="mono-type text-lg font-bold text-[#078dca]">01</span><h2 className="mt-4 font-bold">Submit once</h2><p className="mt-2 text-sm leading-6 text-[#53616c]">Share the details and supporting files the right team needs to understand the issue.</p></div><div className="border-l-4 border-[#078dca] bg-white p-5"><span className="mono-type text-lg font-bold text-[#078dca]">02</span><h2 className="mt-4 font-bold">Track clearly</h2><p className="mt-2 text-sm leading-6 text-[#53616c]">See status changes, ownership, and resolution notes in one accessible record.</p></div><div className="border-l-4 border-[#078dca] bg-white p-5"><span className="mono-type text-lg font-bold text-[#078dca]">03</span><h2 className="mt-4 font-bold">Close the loop</h2><p className="mt-2 text-sm leading-6 text-[#53616c]">Review the response and confirm when your grievance has been resolved.</p></div></section>
    </main>
    <footer className="bg-[#0d1830] px-5 py-6 text-center text-xs text-[#c3ced8]">Copyright 2026 · Grievance Management System · Privacy and accountability by design</footer>
  </div>;
}

function Landing() {
  return <div className="min-h-[100dvh] overflow-hidden bg-[#f7f4ea] text-[#203c49]">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Logo /><nav className="hidden items-center gap-8 text-sm font-semibold text-[#5c716e] md:flex"><a href="#how-it-works" data-testid="link-how-it-works">How it works</a><a href="#accountability" data-testid="link-accountability">Accountability</a><a href="#help" data-testid="link-help">Need help?</a></nav><div className="flex items-center gap-2"><Link href="/login" data-testid="link-login-header" className="rounded-lg px-3 py-2 text-sm font-bold text-[#315467] hover:bg-[#ece7da]">Log in</Link><Link href="/register" data-testid="link-register-header" className="rounded-lg bg-[#244d5e] px-4 py-2.5 text-sm font-bold text-[#fffdf8] hover:bg-[#1b3e4d]">Create account</Link></div></header>
     <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 md:grid-cols-[1.05fr_.95fr] md:pb-28 md:pt-20"><div className="relative z-10 page-enter"><p className="mono-type mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#a16e32]"><span className="h-px w-8 bg-[#c58c3e]" />A clearer line to public service</p><h1 className="display-type max-w-[700px] text-[clamp(3.4rem,8vw,6.9rem)] font-bold leading-[.91] tracking-[-.06em] text-[#203c49]">Your concern.<br /><em className="font-normal text-[#3f7673]">In view.</em></h1><p className="mt-8 max-w-[530px] text-lg leading-8 text-[#627471]">Grievance Management System gives residents a simple, accountable way to raise concerns, follow every handoff, and see what happens next.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/register" data-testid="link-start-concern" className="inline-flex items-center gap-2 rounded-lg bg-[#efc574] px-5 py-3.5 text-sm font-bold text-[#203c49] shadow-[0_7px_0_#c79d5b] hover:-translate-y-px hover:shadow-[0_8px_0_#c79d5b]">Raise a concern <ArrowRight size={17} /></Link><Link href="/login" data-testid="link-track-concern" className="inline-flex items-center gap-2 rounded-lg border border-[#cdd4cd] bg-[#fffdf8] px-5 py-3.5 text-sm font-bold text-[#315467] hover:border-[#315467]">Track a concern</Link></div><div className="mt-12 flex items-center gap-5 text-xs font-semibold text-[#73817d]"><span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-[#3f7673]" />No calls to chase</span><span className="flex items-center gap-1.5"><ShieldCheck size={15} className="text-[#3f7673]" />Updates are visible</span></div></div><div className="relative mx-auto w-full max-w-[520px] page-enter stagger-2"><div className="absolute -right-8 -top-8 h-48 w-48 rounded-full border-[22px] border-[#e9ce98]/50" /><div className="relative rotate-[2deg] rounded-[28px] bg-[#244d5e] p-4 shadow-[18px_24px_0_#dcd6c7]"><div className="rounded-[19px] border border-[#53757b] bg-[#315d68] p-5 text-[#f7f4ea]"><div className="flex items-center justify-between border-b border-[#618087] pb-4"><span className="mono-type text-[10px] uppercase tracking-[.15em] text-[#b7cbca]">Case overview</span><span className="rounded-full bg-[#eec16d] px-2.5 py-1 text-[10px] font-bold text-[#274651]">LIVE TRACKING</span></div><div className="py-7"><p className="text-xs text-[#b7cbca]">GRIEVANCE ID</p><p className="mono-type mt-1 text-xl text-[#f4c875]">OS-24-01872</p><p className="mt-5 text-xl font-bold">Streetlight outage on<br />Mango Avenue</p><p className="mt-2 text-sm text-[#bad0ce]">Public lighting · North district</p></div><div className="relative grid grid-cols-4 gap-1 pb-3 pt-2"><div className="absolute left-2 right-2 top-[17px] h-px bg-[#789397]" /><div className="relative z-10"><span className="mx-auto block h-3 w-3 rounded-full bg-[#efc574] ring-4 ring-[#315d68]" /><p className="mt-3 text-center text-[9px] text-[#d4e0dc]">Sent</p></div><div className="relative z-10"><span className="mx-auto block h-3 w-3 rounded-full bg-[#efc574] ring-4 ring-[#315d68]" /><p className="mt-3 text-center text-[9px] text-[#d4e0dc]">Reviewed</p></div><div className="relative z-10"><span className="mx-auto block h-3 w-3 rounded-full bg-[#efc574] ring-4 ring-[#315d68]" /><p className="mt-3 text-center text-[9px] text-[#d4e0dc]">Assigned</p></div><div className="relative z-10"><span className="mx-auto block h-3 w-3 rounded-full bg-[#9eb6b5] ring-4 ring-[#315d68]" /><p className="mt-3 text-center text-[9px] text-[#d4e0dc]">Resolved</p></div></div><div className="mt-5 rounded-xl bg-[#244d5e] p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a9c0bd]">Latest update · today</p><p className="mt-1 text-sm font-semibold">Assigned to Public Works</p></div></div></div><div className="absolute -bottom-7 -left-7 rounded-xl border border-[#d8d8ce] bg-[#fffdf8] p-4 shadow-[0_12px_24px_rgba(45,63,62,.1)]"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#e7f0eb] text-[#377044]"><Check size={15} /></span><span><strong className="block text-xs text-[#315467]">Visibility by default</strong><small className="text-[10px] text-[#71817e]">Every update, in one place</small></span></div></div></div></section>
    <section id="how-it-works" className="border-y border-[#e1ded4] bg-[#eeece3] px-5 py-20 sm:px-8"><div className="mx-auto max-w-7xl"><div className="grid gap-10 md:grid-cols-[.75fr_1.25fr]"><div><p className="mono-type text-[10px] font-bold uppercase tracking-[.18em] text-[#a16e32]">A practical promise</p><h2 className="display-type mt-3 max-w-sm text-4xl font-bold leading-tight">Less wondering.<br />More knowing.</h2></div><div className="grid gap-5 sm:grid-cols-3"><div className="border-l-2 border-[#d7a858] pl-4"><span className="mono-type text-3xl text-[#3f7673]">01</span><h3 className="mt-5 font-bold">Tell it once</h3><p className="mt-2 text-sm leading-6 text-[#687874]">Share the details that help the right team understand the problem from the start.</p></div><div className="border-l-2 border-[#d7a858] pl-4"><span className="mono-type text-3xl text-[#3f7673]">02</span><h3 className="mt-5 font-bold">See the handoffs</h3><p className="mt-2 text-sm leading-6 text-[#687874]">A plain-language timeline shows where your concern is and who has it now.</p></div><div className="border-l-2 border-[#d7a858] pl-4"><span className="mono-type text-3xl text-[#3f7673]">03</span><h3 className="mt-5 font-bold">Close the loop</h3><p className="mt-2 text-sm leading-6 text-[#687874]">Review the response, accept the resolution, or tell us what still needs attention.</p></div></div></div></div></section>
    <section id="accountability" className="paper-grid px-5 py-20 sm:px-8"><div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2"><div className="rounded-2xl border border-[#d6d9d0] bg-[#fffdf8] p-7 shadow-[10px_10px_0_#e5ded0]"><div className="flex items-center justify-between border-b border-[#e6e5dc] pb-4"><span className="flex items-center gap-2 text-sm font-bold"><History size={17} className="text-[#3f7673]" />A visible record</span><span className="mono-type text-[9px] text-[#82908b]">IMMUTABLE LOG</span></div>{['Concern submitted by resident','Reviewed by service desk','Assigned to Public Works','Officer update posted'].map((item, i) => <div key={item} className="flex items-center gap-3 border-b border-[#eeeae1] py-4 last:border-0"><span className={`grid h-7 w-7 place-items-center rounded-full ${i === 3 ? 'bg-[#f4f0e3] text-[#b08337]' : 'bg-[#e6efec] text-[#3f7673]'}`}>{i === 3 ? <Clock3 size={14} /> : <Check size={14} />}</span><div><p className="text-sm font-semibold">{item}</p><small className="text-xs text-[#82908b]">{i === 0 ? '12 March · 09:42' : i === 1 ? '12 March · 11:18' : i === 2 ? '13 March · 08:06' : 'Today · 14:22'}</small></div></div>)}</div><div><p className="mono-type text-[10px] font-bold uppercase tracking-[.18em] text-[#a16e32]">Built for trust</p><h2 className="display-type mt-3 text-4xl font-bold leading-tight">Accountability should be easy to see.</h2><p className="mt-5 max-w-lg text-base leading-7 text-[#687874]">No jargon, no black boxes, no dead ends. OpenSignal gives people and public-service teams the same shared picture of progress.</p><Link href="/register" data-testid="link-accountability-cta" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#3f7673] hover:text-[#244d5e]">Make your first report <ArrowRight size={16} /></Link></div></div></section>
     <footer id="help" className="bg-[#203f4d] px-5 py-10 text-[#d4e0dc] sm:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 sm:flex-row sm:items-center"><Logo inverse /><p className="max-w-md text-xs leading-5 text-[#a9c0bd]">Grievance Management System is a public-service channel for reporting local concerns and making progress visible.</p><span className="text-xs text-[#a9c0bd]">Need assistance? Visit your local service desk.</span></div></footer>
  </div>;
}

function AuthLayout({ children, eyebrow, title, detail }: { children: React.ReactNode; eyebrow: string; title: string; detail: string }) {
  return <div className="min-h-[100dvh] bg-[#f4f6f8]"><header className="border-t-[3px] border-[#0d1830] border-b border-[#dce3e7] bg-white"><div className="mx-auto flex h-[70px] max-w-[1200px] items-center justify-between px-5 sm:px-8"><Logo /><Link href="/" data-testid="link-auth-home" className="text-xs font-bold text-[#53616c] hover:text-[#078dca]">Public portal</Link></div></header><main className="mx-auto grid max-w-[1200px] gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[.75fr_1fr] lg:py-16"><section className="hidden border border-[#c8d3da] bg-[#0d1830] p-9 text-white lg:block"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#72d0ef]">Secure citizen access</p><h2 className="display-type mt-5 text-4xl font-extrabold leading-tight">One record for every concern.</h2><p className="mt-5 text-sm leading-7 text-[#c3ced8]">Keep your submissions, status updates, and resolutions together in a transparent service record.</p><div className="mt-10 border-t border-[#34435b] pt-5 text-xs text-[#aebdca]"><ShieldCheck size={18} className="mb-3 text-[#72d0ef]" />Private by design. Accountable by default.</div></section><section className="mx-auto w-full max-w-[500px] page-enter"><div className="mb-8 lg:hidden"><Logo /></div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#078dca]">{eyebrow}</p><h1 className="display-type mt-3 text-4xl font-extrabold text-[#172333]">{title}</h1><p className="mt-2 text-sm leading-6 text-[#53616c]">{detail}</p>{children}</section></main><footer className="mt-auto bg-[#0d1830] px-5 py-5 text-center text-xs text-[#c3ced8]">Copyright 2026 · Grievance Management System</footer></div>;
}

function ServiceConsentForm({ config }: { config: ServiceConfig }) {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const create = useCreateConsent();
  const submittedRef = useRef(false);
  const [form, setForm] = useState(() => {
    const pending = readPendingService();
    return pending?.service === config.key
      ? { name: pending.name, email: pending.email, phone: pending.phone, consentAccepted: true }
      : { name: '', email: '', phone: '', consentAccepted: false };
  });
  const [error, setError] = useState('');

  const saveConsent = (values: { name: string; email: string; phone: string; consentAccepted: true }) => {
    create.mutate({ data: { service: config.key, ...values } }, {
      onSuccess: () => {
        clearPendingService();
        queryClient.invalidateQueries({ queryKey: getListMyConsentsQueryKey() });
        setLocation('/consents');
      },
      onError: (requestError) => {
        if ((requestError as { status?: number }).status === 401) {
          if (typeof window !== 'undefined') window.sessionStorage.setItem(pendingServiceStorageKey, JSON.stringify({ service: config.key, ...values }));
          setLocation('/login');
          return;
        }
        setError('We could not save this service request. Please check your details and try again.');
      },
    });
  };

  useEffect(() => {
    const pending = readPendingService();
    if (user && pending?.service === config.key && !submittedRef.current) {
      submittedRef.current = true;
      saveConsent(pending);
    }
  }, [config.key, user]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.consentAccepted) {
      setError('Please accept the consent notice before submitting.');
      return;
    }
    const values = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), consentAccepted: true as const };
    if (!user) {
      if (typeof window !== 'undefined') window.sessionStorage.setItem(pendingServiceStorageKey, JSON.stringify({ service: config.key, ...values }));
      setLocation('/login');
      return;
    }
    saveConsent(values);
  };
  const Icon = config.icon;
  return <div className="min-h-[100dvh] bg-[#f4f6f8] text-[#172333]">
    <header className="border-t-[3px] border-[#0d1830] border-b border-[#dce3e7] bg-white">
      <div className="mx-auto flex h-[70px] max-w-[1400px] items-center justify-between px-5 sm:px-8"><Logo /><div className="flex items-center gap-2"><Link href="/login" className="rounded px-3 py-2 text-xs font-bold text-[#344554] hover:bg-[#eef8fb]">Sign in</Link><Link href="/register" className="rounded bg-[#078dca] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0679ae]">Create account</Link></div></div>
    </header>
    <main className="mx-auto max-w-4xl px-5 py-9 sm:px-8 lg:py-14">
      <div className="mb-8 text-xs text-[#72808d]"><Link href="/" className="font-semibold text-[#078dca]">Home</Link><span className="mx-2">/</span>Services<span className="mx-2">/</span>{config.title}</div>
      <div className="mb-8 flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e3efec] text-[#3f7673]"><Icon size={23} /></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#078dca]">Service consent</p><h1 className="display-type mt-2 text-4xl font-bold text-[#203c49]">{config.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#627471]">{config.description}</p></div></div>
      <form onSubmit={submit} className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-5 shadow-[0_3px_0_#e4e1d8] sm:p-8">
        <h2 className="text-xl font-bold text-[#315467]">Tell us about you</h2>
        <p className="mt-1 text-sm text-[#87938e]">Use the details where you would like us to contact you about this service.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Full name" name="service-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" required /><Field label="Email address" name="service-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required /><Field label="Phone number" name="service-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" required /></div>
        <section className="mt-7 border border-[#b9d8df] bg-[#f1f9fb] p-5" data-testid="service-consent-notice"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#078dca]">Consent notice</p><p className="mt-3 text-sm leading-7 text-[#344554]">{config.notice}</p><label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-[#d5e8ec] pt-4 text-sm font-semibold text-[#315467]"><input type="checkbox" checked={form.consentAccepted} onChange={(event) => setForm({ ...form, consentAccepted: event.target.checked })} className="mt-0.5 h-4 w-4 accent-[#078dca]" data-testid="checkbox-consent-accepted" />I have read and accept this consent notice.</label></section>
        {error && <p className="mt-5 rounded-lg bg-[#fff0eb] p-3 text-sm font-semibold text-[#a9473f]" data-testid="text-service-error">{error}</p>}
        {!user && !userLoading && <p className="mt-5 text-xs leading-5 text-[#72808d]">After you submit, we’ll ask you to sign in or create a resident account before saving this consent to your dashboard.</p>}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e5dc] pt-5"><Link href="/" className="text-sm font-bold text-[#71817e] hover:text-[#315467]">Cancel</Link><Button type="submit" disabled={create.isPending || userLoading} data-testid="button-submit-service-consent">{create.isPending ? 'Saving…' : 'Submit service request'}</Button></div>
      </form>
    </main>
    <footer className="bg-[#0d1830] px-5 py-6 text-center text-xs text-[#c3ced8]">Copyright 2026 · Grievance Management System · Privacy and accountability by design</footer>
  </div>;
}

function ServiceSignupPage() {
  const params = useParams<{ service: string }>();
  const config = serviceConfigs.find((item) => item.slug === params.service);
  return config ? <ServiceConsentForm config={config} /> : <NotFound />;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const login = useLogin();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  return <AuthLayout eyebrow="Welcome back" title="Sign in to follow through." detail="Use your email or mobile number to see your concerns and the latest updates."><form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); setError(''); login.mutate({ data: form }, { onSuccess: (result) => setLocation(postAuthLocation(result.user.role)), onError: () => setError('That sign-in did not work. Check your details and try again.') }); }}><Field label="Email or mobile number" name="identifier" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="you@example.com" autoComplete="username" required /><Field label="Password" name="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter your password" autoComplete="current-password" required />{error && <p className="rounded-lg bg-[#fff0eb] p-3 text-sm font-semibold text-[#a9473f]" data-testid="text-login-error">{error}</p>}<Button type="submit" className="w-full" disabled={login.isPending} data-testid="button-login">{login.isPending ? 'Signing in…' : <><LogIn size={17} />Sign in</>}</Button></form><div className="mt-8 border-t border-[#e1ded4] pt-6 text-center text-sm text-[#71817e]">New to DPDP Consultants? <Link href="/register" data-testid="link-register" className="font-bold text-[#078dca] hover:underline">Create an account</Link></div><Link href="/" data-testid="link-back-home" className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-[#72808d] hover:text-[#078dca]"><ArrowLeft size={14} />Back to DPDP Consultants</Link></AuthLayout>;
}

function RegisterPage() {
  const [, setLocation] = useLocation();
  const register = useRegister();
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  return <AuthLayout eyebrow="Start here" title="Create your resident account." detail="It takes about two minutes. Your account makes every update easy to find."><form className="mt-8 space-y-4" onSubmit={(event) => { event.preventDefault(); if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; } setError(''); register.mutate({ data: { ...form, email: form.email || null } }, { onSuccess: (result) => setLocation(postAuthLocation(result.user.role)), onError: () => setError('We could not create that account. Check the details and try again.') }); }}><Field label="Full name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" required /><Field label="Email address" name="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /><Field label="Mobile number" name="mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="+1 555 000 0000" required /><div className="grid gap-4 sm:grid-cols-2"><Field label="Password" name="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="8 characters minimum" autoComplete="new-password" required /><Field label="Confirm password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Repeat password" autoComplete="new-password" required /></div>{error && <p className="rounded-lg bg-[#fff0eb] p-3 text-sm font-semibold text-[#a9473f]" data-testid="text-register-error">{error}</p>}<Button type="submit" className="mt-2 w-full" disabled={register.isPending} data-testid="button-register">{register.isPending ? 'Creating account…' : <><ArrowRight size={17} />Create account</>}</Button><p className="pt-2 text-center text-[11px] leading-5 text-[#85908b]">By continuing, you agree to use this service respectfully and accurately.</p></form><div className="mt-7 border-t border-[#e1ded4] pt-6 text-center text-sm text-[#71817e]">Already have an account? <Link href="/login" data-testid="link-login" className="font-bold text-[#3f7673] hover:underline">Sign in</Link></div></AuthLayout>;
}

function MetricCard({ label, value, detail, accent = 'teal', icon: Icon }: { label: string; value: string | number; detail: string; accent?: 'teal' | 'gold' | 'coral' | 'ink'; icon: LucideIcon }) {
  const accents = { teal: 'bg-[#e3efec] text-[#3f7673]', gold: 'bg-[#f3ead4] text-[#a16e32]', coral: 'bg-[#f7e6df] text-[#a9473f]', ink: 'bg-[#e5e9eb] text-[#315467]' };
  return <div className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-5 shadow-[0_3px_0_#e4e1d8]"><div className="flex items-start justify-between"><span className={`grid h-9 w-9 place-items-center rounded-lg ${accents[accent]}`}><Icon size={18} /></span><span className="mono-type text-[10px] text-[#9aa5a0]">LIVE</span></div><p data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="mt-5 text-3xl font-bold tracking-[-.05em] text-[#203c49]">{value}</p><p className="mt-1 text-xs font-bold text-[#526865]">{label}</p><p className="mt-2 text-[11px] text-[#87938e]">{detail}</p></div>;
}

function GrievanceRow({ item, base = '/grievances' }: { item: Grievance; base?: string }) {
  return <Link href={`${base}/${item.id}`} data-testid={`card-grievance-${item.id}`} className="group grid gap-3 border-b border-[#e8e5dc] px-4 py-4 transition-colors hover:bg-[#faf8f1] sm:grid-cols-[1fr_150px_125px] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="mono-type text-[10px] font-bold text-[#a16e32]">{item.grievanceId}</span><span className="text-[10px] text-[#a0aaa4]">·</span><span className="text-[11px] text-[#74827e]">{item.category?.name}</span></div><h3 className="mt-1 truncate text-sm font-bold text-[#315467] group-hover:text-[#3f7673]">{item.subject}</h3><p className="mt-1 truncate text-xs text-[#89948f]">{item.relatedOrganization || 'No organization specified'}</p></div><div className="text-xs text-[#71817e]"><span className="block text-[10px] uppercase tracking-wide text-[#a0aaa4]">Updated</span>{formatDate(item.updatedAt)}</div><div className="sm:text-right"><StatusBadge status={item.status} /></div></Link>;
}

function formatDate(value?: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function formatDateTime(value?: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }

function CitizenDashboard() {
  const { data, isLoading, isError, refetch } = useListMyGrievances({ page: 1, pageSize: 5 });
  const { data: notifications } = useListNotifications();
  const items = data?.items || [];
  return <AppShell><PageTitle eyebrow="Resident overview" title="Good to see you." description="A quiet place to keep track of what you’ve raised and what happens next." action={<Link href="/grievances/new" data-testid="link-new-grievance-dashboard" className="inline-flex items-center gap-2 rounded-lg bg-[#efc574] px-4 py-3 text-sm font-bold text-[#203c49] shadow-[0_5px_0_#c79d5b] hover:-translate-y-px"><Plus size={17} />Raise a concern</Link>} /><div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Open concerns" value={data?.total ?? '—'} detail="Everything not yet closed" icon={FileText} accent="teal" /><MetricCard label="In progress" value={items.filter((item) => item.status === GrievanceStatus.IN_PROGRESS || item.status === GrievanceStatus.ASSIGNED).length || '—'} detail="With a service team now" icon={Clock3} accent="gold" /><MetricCard label="Unread updates" value={notifications?.filter((item) => !item.isRead).length ?? '—'} detail="New messages to review" icon={Bell} accent="coral" /></div><div className="mt-7 grid gap-6 xl:grid-cols-[1.45fr_.75fr]"><section className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8]"><div className="flex items-center justify-between border-b border-[#e8e5dc] p-5"><div><h2 className="font-bold text-[#315467]">Your recent concerns</h2><p className="mt-1 text-xs text-[#87938e]">Follow each one from submission to closure.</p></div><Link href="/grievances" data-testid="link-view-all-grievances" className="text-xs font-bold text-[#3f7673] hover:underline">View all</Link></div>{isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : isError ? <div className="p-4"><ErrorState onRetry={() => refetch()} /></div> : items.length ? items.map((item) => <GrievanceRow key={item.id} item={item} />) : <div className="p-5"><EmptyState title="Nothing raised yet" text="When you submit a concern, its progress will appear here." action={<Link href="/grievances/new" data-testid="link-empty-new-grievance" className="font-bold text-[#3f7673]">Raise your first concern <ArrowRight size={14} className="inline" /></Link>} /></div>}</section><section className="rounded-2xl border border-[#dfdfd5] bg-[#315d68] p-6 text-[#f7f4ea]"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#457982] text-[#efc574]"><LifeBuoy size={18} /></span><Sparkles size={17} className="text-[#efc574]" /></div><h2 className="display-type mt-8 text-3xl font-bold">Need to report something?</h2><p className="mt-3 text-sm leading-6 text-[#c4d6d2]">A clear description helps the right service team act sooner.</p><Link href="/grievances/new" data-testid="link-raise-concern-card" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#efc574] px-4 py-3 text-xs font-bold text-[#203c49] hover:bg-[#f5d48c]">Start a new concern <ArrowRight size={15} /></Link></section></div></AppShell>;
}

function PortalGrievanceListPage({ mode = 'citizen' }: { mode?: 'citizen' | 'officer' | 'admin' }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const isAdmin = mode === 'admin';
  const query = isAdmin ? useListAdminGrievances({ page, pageSize: 10, search: search || undefined, status: status as GrievanceStatusType || undefined }) : mode === 'officer' ? useListOfficerGrievances({ page, pageSize: 10, search: search || undefined, status: status as GrievanceStatusType || undefined }) : useListMyGrievances({ page, pageSize: 10, search: search || undefined, status: status as GrievanceStatusType || undefined });
  const items = query.data?.items || [];
  const base = isAdmin ? '/admin/grievances' : mode === 'officer' ? '/officer/grievances' : '/grievances';
  const title = isAdmin ? 'All grievances' : mode === 'officer' ? 'Assigned queue' : 'My grievances';
  return <AppShell mode={mode}><PageTitle eyebrow={isAdmin ? 'Administration' : mode === 'officer' ? 'Officer workspace' : 'Resident account'} title={title} description="Search and review the complete record of every grievance." action={!isAdmin && mode === 'citizen' ? <Link href="/grievances/new" data-testid="link-new-grievance-list" className="inline-flex items-center gap-2 rounded bg-[#078dca] px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} />Submit grievance</Link> : undefined} />
    <div className="mb-5 flex flex-col gap-3 border border-[#d8e0e5] bg-white p-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-3 text-[#72808d]" /><input data-testid="input-grievance-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by reference number or subject" className="h-10 w-full rounded border border-[#cbd6dc] bg-[#f7f9fa] pl-9 pr-3 text-sm outline-none focus:border-[#078dca]" /></div><div className="relative"><select data-testid="select-grievance-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 w-full rounded border border-[#cbd6dc] bg-white px-3 pr-8 text-sm font-semibold text-[#344554] outline-none focus:border-[#078dca] sm:w-48"><option value="">All statuses</option>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div><button data-testid="button-filter-reset" onClick={() => { setSearch(''); setStatus(''); setPage(1); }} className="inline-flex h-10 items-center justify-center gap-2 rounded px-3 text-xs font-bold text-[#53616c] hover:bg-[#eef8fb]"><X size={14} />Clear</button></div>
    <div className="mb-4 flex overflow-x-auto border-b border-[#d8e0e5] bg-white px-2"><button data-testid="tab-status-all" onClick={() => { setStatus(''); setPage(1); }} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold ${!status ? 'border-[#078dca] text-[#078dca]' : 'border-transparent text-[#72808d]'}`}>All grievances</button>{Object.entries(statusMeta).map(([value, meta]) => <button key={value} data-testid={`tab-status-${value.toLowerCase()}`} onClick={() => { setStatus(value); setPage(1); }} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold ${status === value ? 'border-[#078dca] text-[#078dca]' : 'border-transparent text-[#72808d]'}`}>{meta.label}</button>)}</div>
    <section className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Reference / grievance</th><th>Category</th><th>Submitted</th><th>Last updated</th><th>Status</th></tr></thead><tbody>{query.isLoading ? <tr><td colSpan={5}><LoadingState rows={4} /></td></tr> : query.isError ? <tr><td colSpan={5}><ErrorState onRetry={() => query.refetch()} /></td></tr> : items.length ? items.map((item) => <tr key={item.id} data-testid={`row-grievance-${item.id}`}><td><Link href={`${base}/${item.id}`} data-testid={`card-grievance-${item.id}`} className="font-bold text-[#078dca] hover:underline">{item.grievanceId}</Link><p className="mt-1 max-w-[330px] font-semibold text-[#172333]">{item.subject}</p><p className="mt-1 text-xs text-[#72808d]">{item.relatedOrganization || 'No organization specified'}</p></td><td>{item.category?.name || '—'}</td><td className="whitespace-nowrap">{formatDate(item.createdAt)}</td><td className="whitespace-nowrap">{formatDate(item.updatedAt)}</td><td><StatusBadge status={item.status} /></td></tr>) : <tr><td colSpan={5}><EmptyState icon={Search} title="No matching grievances" text="Try a different keyword or clear the filters to see more records." /></td></tr>}</tbody></table><div className="flex items-center justify-between border-t border-[#d8e0e5] px-4 py-3 text-xs text-[#72808d]"><span>{query.data ? `${query.data.total} record${query.data.total === 1 ? '' : 's'}` : 'Loading records…'}</span><div className="flex gap-2"><button data-testid="button-previous-page" disabled={page <= 1 || query.isLoading} onClick={() => setPage((current) => current - 1)} className="rounded border border-[#cbd6dc] bg-white px-3 py-1.5 font-bold disabled:opacity-40">Previous</button><span className="px-2 py-1.5">Page {page} of {query.data?.totalPages || 1}</span><button data-testid="button-next-page" disabled={page >= (query.data?.totalPages || 1) || query.isLoading} onClick={() => setPage((current) => current + 1)} className="rounded border border-[#cbd6dc] bg-white px-3 py-1.5 font-bold disabled:opacity-40">Next</button></div></div></section>
  </AppShell>;
}

function GrievanceListPage({ mode = 'citizen' }: { mode?: 'citizen' | 'officer' | 'admin' }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const isAdmin = mode === 'admin';
  const query = isAdmin ? useListAdminGrievances({ page, pageSize: 10, search: search || undefined, status: status as GrievanceStatusType || undefined }) : mode === 'officer' ? useListOfficerGrievances({ page, pageSize: 10, search: search || undefined, status: status as GrievanceStatusType || undefined }) : useListMyGrievances({ page, pageSize: 10, search: search || undefined, status: status as GrievanceStatusType || undefined });
  const items = query.data?.items || [];
  return <AppShell mode={mode}><PageTitle eyebrow={isAdmin ? 'Operations' : mode === 'officer' ? 'Assigned queue' : 'Resident account'} title={isAdmin ? 'All grievances' : mode === 'officer' ? 'Assigned to you' : 'My grievances'} description={isAdmin ? 'A single working view of every concern moving through the service.' : mode === 'officer' ? 'Work the queue with the context residents can see.' : 'Search, sort, and open any concern to see its complete record.'} action={!isAdmin && mode === 'citizen' ? <Link href="/grievances/new" data-testid="link-new-grievance-list" className="inline-flex items-center gap-2 rounded-lg bg-[#244d5e] px-4 py-3 text-sm font-bold text-white hover:bg-[#1b3e4d]"><Plus size={17} />Raise a concern</Link> : undefined} /><div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Search size={17} className="absolute left-3 top-3 text-[#87938e]" /><input data-testid="input-grievance-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by ID, subject, or keyword" className="focus-ring h-11 w-full rounded-lg bg-[#f5f3ed] pl-10 pr-3 text-sm outline-none placeholder:text-[#9aa5a0]" /></div><div className="relative"><Filter size={15} className="absolute left-3 top-3.5 text-[#87938e]" /><select data-testid="select-grievance-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="focus-ring h-11 w-full appearance-none rounded-lg bg-[#f5f3ed] pl-9 pr-10 text-sm font-semibold text-[#526865] outline-none sm:w-44"><option value="">All statuses</option>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-3.5 text-[#87938e]" /></div><button data-testid="button-filter-reset" onClick={() => { setSearch(''); setStatus(''); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-[#71817e] hover:bg-[#f0ede5]"><X size={15} />Clear</button></div><section className="overflow-hidden rounded-2xl border border-[#dfdfd5] bg-[#fffdf8]"><div className="hidden grid-cols-[1fr_150px_125px] border-b border-[#e8e5dc] bg-[#faf9f4] px-4 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9690] sm:grid"><span>Concern</span><span>Last updated</span><span className="text-right">Status</span></div>{query.isLoading ? <div className="p-4"><LoadingState rows={5} /></div> : query.isError ? <div className="p-4"><ErrorState onRetry={() => query.refetch()} /></div> : items.length ? items.map((item) => <GrievanceRow key={item.id} item={item} base={isAdmin ? '/admin/grievances' : mode === 'officer' ? '/officer/grievances' : '/grievances'} />) : <div className="p-4"><EmptyState icon={Search} title="No matching concerns" text="Try a different keyword or clear the filters to see more records." /></div>}<div className="flex items-center justify-between border-t border-[#e8e5dc] px-4 py-3"><span className="text-xs text-[#87938e]">{query.data ? `${query.data.total} record${query.data.total === 1 ? '' : 's'}` : 'Loading records…'}</span><div className="flex items-center gap-2"><button data-testid="button-previous-page" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-[#d7d8cf] p-2 text-[#55706f] disabled:opacity-35"><ArrowLeft size={15} /></button><span data-testid="text-current-page" className="mono-type min-w-7 text-center text-xs text-[#71817e]">{page}</span><button data-testid="button-next-page" disabled={!query.data || page >= query.data.totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-[#d7d8cf] p-2 text-[#55706f] disabled:opacity-35"><ArrowRight size={15} /></button></div></div></section></AppShell>;
}

function NewGrievancePage() {
  const [, setLocation] = useLocation();
  const { data: categories, isLoading: catsLoading } = useListCategories();
  const create = useCreateGrievance();
  const [form, setForm] = useState({ categoryId: '', subject: '', description: '', relatedOrganization: '' });
  const [attachment, setAttachment] = useState<{ name: string; size: number; mimeType: string; dataUrl: string } | null>(null);
  const [error, setError] = useState('');
  const handleFile = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setAttachment({ name: file.name, size: file.size, mimeType: file.type, dataUrl: String(reader.result) }); reader.readAsDataURL(file); };
  return <AppShell><PageTitle eyebrow="New concern" title="Tell us what needs attention." description="Be specific about what you’ve seen, where it is, and what would make it better." /><div className="grid gap-7 lg:grid-cols-[1fr_320px]"><form onSubmit={(event) => { event.preventDefault(); setError(''); create.mutate({ data: { ...form, relatedOrganization: form.relatedOrganization || null, attachment } }, { onSuccess: (item) => { queryClient.invalidateQueries({ queryKey: getListMyGrievancesQueryKey() }); setLocation(`/grievances/${item.id}`); }, onError: () => setError('We could not submit this concern. Please review the form and try again.') }); }} className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-5 sm:p-7"><div className="grid gap-5 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#637270]">What is this about?</span><select data-testid="select-new-category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required className="focus-ring h-11 w-full rounded-lg border border-[#d7d8cf] bg-[#fffdf8] px-3.5 text-sm outline-none">{catsLoading ? <option>Loading categories…</option> : <><option value="">Choose a service area</option>{(categories || []).filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</>}</select></label><div className="sm:col-span-2"><Field label="Short summary" name="subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="For example: Streetlight out on Mango Avenue" maxLength={160} required hint="A short subject helps the right team triage your concern." /></div><div className="sm:col-span-2"><TextField label="What happened?" name="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tell us what you observed, when it started, and anything else that may help." minLength={20} maxLength={5000} required /></div><Field label="Related organization (optional)" name="relatedOrganization" value={form.relatedOrganization} onChange={(e) => setForm({ ...form, relatedOrganization: e.target.value })} placeholder="School, office, neighborhood…" /><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#637270]">Add a file (optional)</span><span className="flex h-11 cursor-pointer items-center justify-between rounded-lg border border-dashed border-[#bfcac4] bg-[#f8f7f1] px-3.5 text-sm text-[#71817e] hover:border-[#3f7673]"><span className="flex min-w-0 items-center gap-2"><FileText size={16} />{attachment ? <span className="truncate">{attachment.name}</span> : 'Photo or document'}</span><input data-testid="input-attachment" type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => handleFile(e.target.files?.[0])} /></span></label></div>{error && <p className="mt-5 rounded-lg bg-[#fff0eb] p-3 text-sm font-semibold text-[#a9473f]" data-testid="text-grievance-error">{error}</p>}<div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e5dc] pt-5"><Link href="/grievances" data-testid="link-cancel-grievance" className="text-sm font-bold text-[#71817e] hover:text-[#315467]">Cancel</Link><Button type="submit" disabled={create.isPending || !form.categoryId} data-testid="button-submit-grievance">{create.isPending ? 'Submitting…' : <><Send size={16} />Submit concern</>}</Button></div></form><aside className="h-fit rounded-2xl bg-[#e2eeea] p-6"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#c5ded7] text-[#3f7673]"><ShieldCheck size={18} /></span><h2 className="mt-5 font-bold text-[#315467]">A good report is specific.</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-[#5d7772]"><li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-[#3f7673]" />Say where the issue is</li><li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-[#3f7673]" />Include dates or times if useful</li><li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-[#3f7673]" />Avoid sharing private information</li></ul><div className="mt-6 border-t border-[#c7ddd6] pt-4 text-xs leading-5 text-[#6d8881]">You will receive a reference number as soon as this is submitted.</div></aside></div></AppShell>;
}

function Timeline({ detail }: { detail: GrievanceDetail }) {
  const history = [...(detail.history || [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return <div className="relative ml-2 border-l border-[#ccd9d4] pl-7">{history.map((event, index) => <div key={event.id} className="relative pb-7 last:pb-0"><span className={`absolute -left-[35px] top-0 grid h-6 w-6 place-items-center rounded-full border-4 border-[#fffdf8] ${index === history.length - 1 ? 'bg-[#efc574] text-[#203c49]' : 'bg-[#3f7673] text-white'}`}><Check size={11} strokeWidth={3} /></span><p className="text-xs font-bold text-[#315467]">{statusMeta[event.newStatus]?.label || event.newStatus}</p><p className="mt-1 text-[11px] text-[#8a9690]">{formatDateTime(event.createdAt)} · {event.changedBy}</p>{event.comment && <p className="mt-2 rounded-lg bg-[#f7f5ef] p-3 text-sm leading-6 text-[#60716e]">{event.comment}</p>}</div>)}</div>;
}

function GrievanceDetailPage({ mode = 'citizen' }: { mode?: 'citizen' | 'admin' | 'officer' }) {
  const params = useParams<{ id: string }>();
  const id = params.id || '';
  const query = mode === 'admin' ? useGetAdminGrievance(id, { query: { enabled: !!id, queryKey: getGetAdminGrievanceQueryKey(id) } }) : mode === 'officer' ? useGetOfficerGrievance(id, { query: { enabled: !!id, queryKey: getGetOfficerGrievanceQueryKey(id) } }) : useGetMyGrievance(id, { query: { enabled: !!id, queryKey: getGetMyGrievanceQueryKey(id) } });
  const detail = query.data;
  const base = mode === 'admin' ? '/admin/grievances' : mode === 'officer' ? '/officer/grievances' : '/grievances';
  const [toast, setToast] = useState('');
  const accept = useAcceptResolution();
  if (query.isLoading) return <AppShell mode={mode}><LoadingState rows={6} /></AppShell>;
  if (query.isError || !detail) return <AppShell mode={mode}><ErrorState onRetry={() => query.refetch()} /></AppShell>;
  return <AppShell mode={mode}><Link href={base} data-testid="link-back-grievances" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-[#71817e] hover:text-[#315467]"><ArrowLeft size={14} />Back to grievances</Link><div className="grid gap-7 lg:grid-cols-[1fr_350px]"><div><div className="page-enter"><div className="flex flex-wrap items-center gap-3"><span className="mono-type text-xs font-bold text-[#a16e32]">{detail.grievanceId}</span><StatusBadge status={detail.status} /></div><h1 data-testid="text-grievance-subject" className="display-type mt-4 text-4xl font-bold leading-tight text-[#203c49] sm:text-5xl">{detail.subject}</h1><p className="mt-3 text-sm text-[#7a8883]">Submitted {formatDate(detail.createdAt)} · Last updated {formatDate(detail.updatedAt)}</p></div><section className="mt-8 rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-5 sm:p-7"><div className="flex items-center justify-between border-b border-[#e8e5dc] pb-4"><h2 className="font-bold text-[#315467]">What you told us</h2><span className="text-xs text-[#87938e]">{detail.category?.name}</span></div><p data-testid="text-grievance-description" className="whitespace-pre-wrap pt-5 text-sm leading-7 text-[#5f706c]">{detail.description}</p>{detail.relatedOrganization && <p className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#71817e]"><Building2 size={15} />Related: {detail.relatedOrganization}</p>}{detail.attachment && <a href={detail.attachment.url} target="_blank" rel="noreferrer" data-testid="link-grievance-attachment" className="mt-5 flex items-center gap-2 rounded-lg bg-[#f4f1e8] p-3 text-xs font-bold text-[#3f7673]"><FileText size={16} />{detail.attachment.name}<ArrowRight className="ml-auto" size={14} /></a>}</section>{detail.resolution && <section className="mt-5 rounded-2xl border border-[#c8ddd5] bg-[#eaf3ef] p-5 sm:p-7"><div className="flex items-center gap-2 text-[#377044]"><CheckCircle2 size={19} /><h2 className="font-bold">Resolution posted</h2></div><p data-testid="text-resolution" className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#4d6c63]">{detail.resolution.text}</p><p className="mt-4 text-xs text-[#718e84]">Resolved {formatDate(detail.resolution.resolvedAt)} by {detail.resolution.resolvedBy}</p>{mode === 'citizen' && detail.status === GrievanceStatus.RESOLVED && <Button className="mt-5" disabled={accept.isPending} onClick={() => accept.mutate({ id }, { onSuccess: (next) => { queryClient.setQueryData(getGetMyGrievanceQueryKey(id), next); setToast('Resolution accepted. This concern is now closed.'); } })} data-testid="button-accept-resolution">{accept.isPending ? 'Closing…' : <><Check size={16} />Accept resolution & close</>}</Button>}</section>}</div><aside className="h-fit space-y-5"><section className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><h2 className="mb-6 font-bold text-[#315467]">Progress record</h2>{detail.history?.length ? <Timeline detail={detail} /> : <EmptyState icon={History} title="No updates yet" text="The first update will appear here when your concern is reviewed." />}</section><section className="rounded-2xl bg-[#244d5e] p-6 text-[#f7f4ea]"><p className="mono-type text-[10px] uppercase tracking-[.15em] text-[#9eb6b5]">Current owner</p><p className="mt-3 font-bold">{detail.assignedDepartment || 'Service desk review'}</p><p className="mt-1 text-sm text-[#b9cfcb]">{detail.assignedOfficer ? `Assigned to ${detail.assignedOfficer}` : 'Waiting for assignment'}</p></section></aside></div>{toast && <Toast message={toast} onClose={() => setToast('')} />}</AppShell>;
}

function NotificationsPage() {
  const { data, isLoading, isError, refetch } = useListNotifications();
  const mark = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [, setLocation] = useLocation();
  const items = data || [];
  return <AppShell><PageTitle eyebrow="Resident account" title="Updates that matter." description="A record of what changed, without the noise." action={<Button variant="outline" disabled={markAll.isPending || !items.some((item) => !item.isRead)} onClick={() => markAll.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) })} data-testid="button-mark-all-read"><Check size={16} />Mark all read</Button>} />{isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : items.length ? <section className="overflow-hidden rounded-2xl border border-[#dfdfd5] bg-[#fffdf8]">{items.map((item) => <button key={item.id} data-testid={`button-notification-${item.id}`} onClick={() => { if (!item.isRead) mark.mutate({ id: item.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) }); if (item.grievanceId) setLocation(`/grievances/${item.grievanceId}`); }} className={`flex w-full items-start gap-4 border-b border-[#e8e5dc] p-5 text-left last:border-0 hover:bg-[#faf8f1] ${item.isRead ? '' : 'bg-[#f1f7f3]'}`}><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.isRead ? 'bg-[#f0ede5] text-[#71817e]' : 'bg-[#e2eeea] text-[#3f7673]'}`}><Bell size={17} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#315467]">{item.title}</strong>{!item.isRead && <span className="h-1.5 w-1.5 rounded-full bg-[#c06a49]" />}</span><span className="mt-1 block text-sm leading-6 text-[#71817e]">{item.message}</span><span className="mono-type mt-2 block text-[10px] text-[#9aa5a0]">{formatDateTime(item.createdAt)}</span></span><ArrowRight size={16} className="mt-2 shrink-0 text-[#9aa5a0]" /></button>)}</section> : <EmptyState icon={Bell} title="You’re all caught up" text="When a service team updates one of your concerns, you’ll see it here." />}</AppShell>;
}

function ProfilePage() {
  const { data: user, isLoading, isError, refetch } = useGetCurrentUser();
  const update = useUpdateCurrentUser();
  const [form, setForm] = useState({ name: '', email: '', mobile: '' });
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => { if (user && !ready) { setForm({ name: user.name, email: user.email || '', mobile: user.mobile }); setReady(true); } }, [user, ready]);
  if (isLoading) return <AppShell><LoadingState rows={3} /></AppShell>;
  if (isError || !user) return <AppShell><ErrorState onRetry={() => refetch()} /></AppShell>;
  return <AppShell><PageTitle eyebrow="Resident account" title="Your profile." description="Keep your contact details current so service teams can reach you when needed." /><div className="grid gap-6 lg:grid-cols-[1fr_340px]"><form className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6 sm:p-8" onSubmit={(e) => { e.preventDefault(); update.mutate({ data: { ...form, email: form.email || null } }, { onSuccess: () => setToast('Profile saved successfully.') }); }}><div className="flex items-center gap-4 border-b border-[#e8e5dc] pb-6"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#e7f0eb] text-lg font-bold text-[#3f7673]">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><h2 className="font-bold">{user.name}</h2><p className="text-xs text-[#87938e]">{user.role === UserRole.USER ? 'Resident account' : user.role}</p></div></div><div className="mt-6 space-y-5"><Field label="Full name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><Field label="Email address" name="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><Field label="Mobile number" name="mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required /></div><Button type="submit" className="mt-7" disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? 'Saving…' : <><Check size={16} />Save profile</>}</Button></form><aside className="h-fit rounded-2xl bg-[#e5eeeb] p-6"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#c5ded7] text-[#3f7673]"><LockKeyhole size={18} /></span><h2 className="mt-5 font-bold text-[#315467]">Your details stay yours.</h2><p className="mt-2 text-sm leading-6 text-[#5d7772]">We only use your contact information to manage your concerns and send important updates.</p><div className="mt-6 border-t border-[#c7ddd6] pt-4 text-xs text-[#6d8881]">Member since {formatDate(user.createdAt)}</div></aside></div>{toast && <Toast message={toast} onClose={() => setToast('')} />}</AppShell>;
}

function AdminDashboard() {
  const { data, isLoading, isError, refetch } = useGetAdminDashboard();
  if (isLoading) return <AppShell mode="admin"><LoadingState rows={6} /></AppShell>;
  if (isError || !data) return <AppShell mode="admin"><ErrorState onRetry={() => refetch()} /></AppShell>;
  const maxCategory = Math.max(...(data.byCategory || []).map((item) => item.count), 1);
  return <AppShell mode="admin"><PageTitle eyebrow="Command center" title="Keep the line moving." description="A live view of service demand, handoffs, and the work that needs attention." action={<Link href="/admin/grievances" data-testid="link-admin-all-grievances" className="inline-flex items-center gap-2 rounded-lg bg-[#244d5e] px-4 py-3 text-sm font-bold text-white hover:bg-[#1b3e4d]"><ClipboardList size={16} />Review queue</Link>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Total concerns" value={data.total} detail="All time in the system" icon={ClipboardList} accent="ink" /><MetricCard label="New to review" value={data.newCount} detail="Submitted or acknowledged" icon={Sparkles} accent="gold" /><MetricCard label="In progress" value={data.inProgress} detail="Currently with a team" icon={Clock3} accent="teal" /><MetricCard label="Resolved" value={data.resolved} detail={`${data.closed} closed after resolution`} icon={CheckCircle2} accent="coral" /></div><div className="mt-7 grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><div className="flex items-start justify-between"><div><h2 className="font-bold text-[#315467]">Demand by service area</h2><p className="mt-1 text-xs text-[#87938e]">Where residents need help most.</p></div><SlidersHorizontal size={18} className="text-[#87938e]" /></div><div className="mt-7 space-y-5">{data.byCategory?.length ? data.byCategory.map((item) => <div key={item.category}><div className="mb-2 flex justify-between text-xs font-bold text-[#60716e]"><span>{item.category}</span><span className="mono-type">{item.count}</span></div><div className="h-2 rounded-full bg-[#edf0eb]"><div className="h-2 rounded-full bg-[#3f7673]" style={{ width: `${Math.max(7, (item.count / maxCategory) * 100)}%` }} /></div></div>) : <EmptyState icon={ListFilter} title="No category data yet" text="Category activity will appear as concerns arrive." />}</div></section><section className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><div className="flex items-start justify-between"><div><h2 className="font-bold text-[#315467]">Status pulse</h2><p className="mt-1 text-xs text-[#87938e]">The shape of the current queue.</p></div><span className="mono-type text-[10px] text-[#9aa5a0]">TODAY</span></div><div className="mt-7 grid grid-cols-2 gap-3">{data.byStatus?.map((item) => <div key={item.status} className="rounded-xl bg-[#f7f5ef] p-4"><StatusBadge status={item.status} /><p className="mt-4 text-2xl font-bold text-[#315467]">{item.count}</p></div>)}</div></section></div><section className="mt-7 rounded-2xl border border-[#dfdfd5] bg-[#fffdf8]"><div className="flex items-center justify-between border-b border-[#e8e5dc] p-5"><div><h2 className="font-bold text-[#315467]">Most recent concerns</h2><p className="mt-1 text-xs text-[#87938e]">The newest records needing a clear next step.</p></div><Link href="/admin/grievances" data-testid="link-admin-view-all" className="text-xs font-bold text-[#3f7673]">View queue</Link></div>{data.recent?.length ? data.recent.map((item) => <GrievanceRow key={item.id} item={item} base="/admin/grievances" />) : <div className="p-4"><EmptyState title="The queue is clear" text="New concerns will appear here for review." /></div>}</section></AppShell>;
}

function AdminGrievanceDetail({ mode = 'admin' }: { mode?: 'admin' | 'officer' }) {
  const params = useParams<{ id: string }>();
  const id = params.id || '';
  const query = mode === 'admin' ? useGetAdminGrievance(id, { query: { enabled: !!id, queryKey: getGetAdminGrievanceQueryKey(id) } }) : useGetOfficerGrievance(id, { query: { enabled: !!id, queryKey: getGetOfficerGrievanceQueryKey(id) } });
  const assign = useAssignGrievance();
  const changeStatus = mode === 'admin' ? useAdminChangeStatus() : useOfficerChangeStatus();
  const addResolution = mode === 'admin' ? useAddAdminResolution() : useAddOfficerResolution();
  const officerQuery = { page: 1, pageSize: 100, role: UserRole.OFFICER };
  const { data: users } = useListUsers(officerQuery, { query: { enabled: mode === 'admin', queryKey: getListUsersQueryKey(officerQuery) } });
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');
  const [department, setDepartment] = useState('');
  const [officerId, setOfficerId] = useState('');
  const [resolution, setResolution] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [toast, setToast] = useState('');
  const detail = query.data;
  if (query.isLoading) return <AppShell mode={mode}><LoadingState rows={6} /></AppShell>;
  if (query.isError || !detail) return <AppShell mode={mode}><ErrorState onRetry={() => query.refetch()} /></AppShell>;
  const submitStatus = () => { if (!status) return; changeStatus.mutate({ id, data: { status: status as GrievanceStatusType, comment: comment || null } }, { onSuccess: (next) => { queryClient.setQueryData(mode === 'admin' ? getGetAdminGrievanceQueryKey(id) : getGetOfficerGrievanceQueryKey(id), next); setToast('Status update recorded.'); setComment(''); } }); };
  const submitResolution = () => { if (resolution.length < 10) return; addResolution.mutate({ id, data: { resolution, internalNotes: internalNotes || null } }, { onSuccess: (next) => { queryClient.setQueryData(mode === 'admin' ? getGetAdminGrievanceQueryKey(id) : getGetOfficerGrievanceQueryKey(id), next); setToast('Resolution posted.'); setResolution(''); setInternalNotes(''); } }); };
  return <AppShell mode={mode}><Link href={mode === 'admin' ? '/admin/grievances' : '/officer/grievances'} data-testid="link-back-work-queue" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-[#71817e]"><ArrowLeft size={14} />Back to queue</Link><div className="grid gap-7 xl:grid-cols-[1fr_360px]"><div><div className="flex flex-wrap items-center gap-3"><span className="mono-type text-xs font-bold text-[#a16e32]">{detail.grievanceId}</span><StatusBadge status={detail.status} /></div><h1 className="display-type mt-4 text-4xl font-bold leading-tight text-[#203c49]">{detail.subject}</h1><p className="mt-3 text-sm text-[#7a8883]">Submitted by {detail.user?.name} · {formatDateTime(detail.createdAt)}</p><section className="mt-8 rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><h2 className="font-bold text-[#315467]">Resident report</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#60716e]">{detail.description}</p></section><section className="mt-5 rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><h2 className="font-bold text-[#315467]">Visible history</h2><div className="mt-6">{detail.history?.length ? <Timeline detail={detail} /> : <p className="text-sm text-[#87938e]">No history yet.</p>}</div></section></div><aside className="space-y-5"><section className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><div className="flex items-center justify-between"><h2 className="font-bold text-[#315467]">Workflow controls</h2><Settings2 size={17} className="text-[#87938e]" /></div><label className="mt-5 block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#637270]">Move to status</span><select data-testid="select-workflow-status" value={status} onChange={(e) => setStatus(e.target.value)} className="focus-ring h-11 w-full rounded-lg border border-[#d7d8cf] bg-[#fffdf8] px-3 text-sm outline-none"><option value="">Choose a status</option>{Object.entries(statusMeta).filter(([key]) => key !== detail.status).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></label><TextField label="Public comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain what changed for the resident." /><Button className="mt-4 w-full" onClick={submitStatus} disabled={!status || changeStatus.isPending} data-testid="button-change-status">{changeStatus.isPending ? 'Saving…' : 'Record status update'}</Button></section>{mode === 'admin' && <section className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><h2 className="font-bold text-[#315467]">Assign owner</h2><Field label="Department" value={department || detail.assignedDepartment || ''} onChange={(e) => setDepartment(e.target.value)} placeholder="Public Works" /><label className="mt-4 block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[.1em] text-[#637270]">Officer</span><select data-testid="select-assign-officer" value={officerId} onChange={(e) => setOfficerId(e.target.value)} className="focus-ring h-11 w-full rounded-lg border border-[#d7d8cf] bg-[#fffdf8] px-3 text-sm outline-none"><option value="">Choose officer</option>{(users?.items || []).filter((user) => user.isActive).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.department}</option>)}</select></label><Button variant="outline" className="mt-4 w-full" disabled={!department || !officerId || assign.isPending} onClick={() => assign.mutate({ id, data: { department, officerId } }, { onSuccess: (next) => { queryClient.setQueryData(getGetAdminGrievanceQueryKey(id), next); setToast('Grievance assigned.'); } })} data-testid="button-assign-grievance">{assign.isPending ? 'Assigning…' : <><Users size={16} />Assign grievance</>}</Button></section>}<section className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-6"><h2 className="font-bold text-[#315467]">Post a resolution</h2><TextField label="Resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Describe what was done to resolve the concern." /><div className="mt-4"><TextField label="Internal notes" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Notes for service teams only." /></div><Button className="mt-4 w-full" disabled={resolution.length < 10 || addResolution.isPending} onClick={submitResolution} data-testid="button-post-resolution">{addResolution.isPending ? 'Posting…' : <><FileCheck2 size={16} />Post resolution</>}</Button></section></aside></div>{toast && <Toast message={toast} onClose={() => setToast('')} />}</AppShell>;
}

function UsersPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useListUsers({ page: 1, pageSize: 50, search: search || undefined });
  const setActive = useSetUserActive();
  const createOfficer = useCreateOfficer();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', department: '' });
  return <AppShell mode="admin"><PageTitle eyebrow="People & officers" title="The people behind the work." description="Manage service access and keep ownership clear." action={<Button onClick={() => setShowForm((value) => !value)} data-testid="button-new-officer"><Plus size={17} />Add officer</Button>} />{showForm && <form className="mb-6 grid gap-4 rounded-2xl border border-[#c9dbd5] bg-[#eaf3ef] p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); createOfficer.mutate({ data: form }, { onSuccess: () => { setShowForm(false); setForm({ name: '', email: '', mobile: '', password: '', department: '' }); queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); } }); }}><Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /><Field label="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required /><Field label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required /><Field label="Temporary password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /><div className="flex items-end"><Button type="submit" disabled={createOfficer.isPending} data-testid="button-create-officer">{createOfficer.isPending ? 'Creating…' : 'Create officer'}</Button></div></form>}<div className="mb-5 relative max-w-md"><Search size={17} className="absolute left-3 top-3 text-[#87938e]" /><input data-testid="input-user-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" className="focus-ring h-11 w-full rounded-lg border border-[#d7d8cf] bg-[#fffdf8] pl-10 text-sm outline-none" /></div>{isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : data?.items?.length ? <section className="overflow-hidden rounded-2xl border border-[#dfdfd5] bg-[#fffdf8]"><div className="hidden grid-cols-[1fr_180px_130px_110px] border-b border-[#e8e5dc] bg-[#faf9f4] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9690] sm:grid"><span>Person</span><span>Role</span><span>Department</span><span className="text-right">Access</span></div>{data.items.map((user) => <div key={user.id} data-testid={`row-user-${user.id}`} className="grid gap-3 border-b border-[#e8e5dc] px-5 py-4 sm:grid-cols-[1fr_180px_130px_110px] sm:items-center"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e7f0eb] text-xs font-bold text-[#3f7673]">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><span><strong className="block text-sm text-[#315467]">{user.name}</strong><small className="text-xs text-[#87938e]">{user.email || user.mobile}</small></span></div><span className="text-xs font-bold text-[#60716e]">{user.role}</span><span className="text-xs text-[#71817e]">{user.department || '—'}</span><span className="sm:text-right"><button data-testid={`button-toggle-user-${user.id}`} onClick={() => setActive.mutate({ id: user.id, data: { isActive: !user.isActive } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }) })} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${user.isActive ? 'bg-[#e5efe6] text-[#377044]' : 'bg-[#f0ede5] text-[#8a9690]'}`}>{user.isActive ? 'Active' : 'Inactive'}</button></span></div>)}</section> : <EmptyState icon={Users} title="No people found" text="Try a different search term or add a service officer." />}</AppShell>;
}

function CategoriesPage() {
  const { data, isLoading, isError, refetch } = useListCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const deactivate = useDeactivateCategory();
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const save = (event: React.FormEvent) => { event.preventDefault(); const finish = () => { setForm({ name: '', description: '' }); setEditing(null); setShowForm(false); queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); }; if (editing) update.mutate({ id: editing, data: form }, { onSuccess: finish }); else create.mutate({ data: form }, { onSuccess: finish }); };
  return <AppShell mode="admin"><PageTitle eyebrow="System configuration" title="Service categories." description="Keep the language of the service aligned with what residents actually need." action={<Button onClick={() => { setShowForm((value) => !value); setEditing(null); setForm({ name: '', description: '' }); }} data-testid="button-new-category"><Plus size={17} />New category</Button>} />{(showForm || editing) && <form onSubmit={save} className="mb-6 grid gap-4 rounded-2xl border border-[#c9dbd5] bg-[#eaf3ef] p-5 sm:grid-cols-[.8fr_1.2fr_auto] sm:items-end"><Field label="Category name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><Field label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><Button type="submit" disabled={create.isPending || update.isPending} data-testid="button-save-category">{create.isPending || update.isPending ? 'Saving…' : 'Save category'}</Button></form>}{isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : data?.length ? <section className="grid gap-4 md:grid-cols-2">{data.map((category) => <div key={category.id} data-testid={`card-category-${category.id}`} className="rounded-2xl border border-[#dfdfd5] bg-[#fffdf8] p-5 shadow-[0_3px_0_#e4e1d8]"><div className="flex items-start justify-between gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6efec] text-[#3f7673]"><ListFilter size={18} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${category.isActive ? 'bg-[#e5efe6] text-[#377044]' : 'bg-[#f0ede5] text-[#8a9690]'}`}>{category.isActive ? 'Active' : 'Inactive'}</span></div><h2 className="mt-5 font-bold text-[#315467]">{category.name}</h2><p className="mt-2 min-h-10 text-sm leading-6 text-[#71817e]">{category.description || 'No description added yet.'}</p><div className="mt-5 flex gap-2 border-t border-[#e8e5dc] pt-4"><button data-testid={`button-edit-category-${category.id}`} onClick={() => { setEditing(category.id); setShowForm(false); setForm({ name: category.name, description: category.description || '' }); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#3f7673] hover:bg-[#eaf3ef]"><Pencil size={14} />Edit</button>{category.isActive && <button data-testid={`button-deactivate-category-${category.id}`} onClick={() => deactivate.mutate({ id: category.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }) })} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#a9473f] hover:bg-[#fff0eb]"><X size={14} />Deactivate</button>}</div></div>)}</section> : <EmptyState icon={ListFilter} title="No categories yet" text="Add your first service category to organize incoming concerns." />}</AppShell>;
}

function AuditLogsPage() {
  const { data, isLoading, isError, refetch } = useListAuditLogs({ page: 1, pageSize: 50 });
  return <AppShell mode="admin"><PageTitle eyebrow="Immutable record" title="Audit history." description="A chronological record of changes made across the service. This history cannot be edited." /><div className="mb-5 flex items-center gap-2 rounded-xl border border-[#d9e2df] bg-[#eaf3ef] p-4 text-xs text-[#5d7772]"><ShieldCheck size={17} className="text-[#3f7673]" /><span><strong className="text-[#315467]">Accountability marker:</strong> Every workflow change records who made it and when.</span></div>{isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : data?.items?.length ? <section className="overflow-hidden rounded-2xl border border-[#dfdfd5] bg-[#fffdf8]">{data.items.map((log) => <div key={log.id} data-testid={`row-audit-${log.id}`} className="grid gap-3 border-b border-[#e8e5dc] p-5 md:grid-cols-[145px_1fr_150px] md:items-center"><div className="mono-type text-[10px] text-[#87938e]">{formatDateTime(log.createdAt)}</div><div><p className="text-sm font-bold text-[#315467]">{log.action}</p><p className="mt-1 text-xs text-[#71817e]">{log.entityType} · {log.entityId}{log.details ? ` · ${log.details}` : ''}</p></div><div className="text-xs text-[#87938e]"><span className="block font-bold text-[#60716e]">Actor</span>{log.actor}</div></div>)}</section> : <EmptyState icon={History} title="No audit entries yet" text="Recorded workflow activity will appear here." />}</AppShell>;
}

function NotFound() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f4ea] p-6 text-center"><div><span className="mono-type text-7xl font-bold text-[#efc574]">404</span><h1 className="display-type mt-4 text-4xl font-bold text-[#203c49]">That page is not in the record.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#71817e]">The link may have moved, or the concern you’re looking for does not exist.</p><Link href="/" data-testid="link-not-found-home" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#244d5e] px-4 py-3 text-sm font-bold text-white"><ArrowLeft size={16} />Return home</Link></div></div>;
}

function AccountLandingPage() {
  const { data: user } = useGetCurrentUser();
  return <AppShell>
    <PageTitle eyebrow="Resident account" title="My account" description="Choose the service you want to manage." />
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="max-w-2xl space-y-4">
        <Link href="/consents" data-testid="link-account-consents" className="group flex items-center gap-5 rounded border border-[#e0e4e7] bg-white p-5 shadow-sm transition hover:border-[#078dca] hover:shadow-md sm:p-6">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded bg-[#eef7fb] text-[#078dca]"><ClipboardList size={34} strokeWidth={1.5} /></span>
          <span><strong className="block text-lg text-[#26384a] group-hover:text-[#078dca]">Consents &amp; Requests</strong><small className="mt-1 block text-sm text-[#72808d]">Manage your consent records and principal rights requests</small></span>
          <ArrowRight className="ml-auto shrink-0 text-[#9aa7b0] transition group-hover:translate-x-1 group-hover:text-[#078dca]" size={19} />
        </Link>
        <Link href="/dashboard" data-testid="link-account-grievances" className="group flex items-center gap-5 rounded border border-[#e0e4e7] bg-white p-5 shadow-sm transition hover:border-[#078dca] hover:shadow-md sm:p-6">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded bg-[#f5f5f5] text-[#526473]"><FileText size={34} strokeWidth={1.5} /></span>
          <span><strong className="block text-lg text-[#26384a] group-hover:text-[#078dca]">Grievance Escalation Requests</strong><small className="mt-1 block text-sm text-[#72808d]">Grievance</small></span>
          <ArrowRight className="ml-auto shrink-0 text-[#9aa7b0] transition group-hover:translate-x-1 group-hover:text-[#078dca]" size={19} />
        </Link>
      </div>
      <aside className="h-fit rounded border border-[#dce3e7] bg-white p-6">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef7fb] text-[#078dca]"><UserRound size={20} /></span><strong className="text-lg text-[#26384a]">{user?.name || 'Resident'}</strong></div>
        <div className="mt-5 space-y-3 border-t border-[#edf0f2] pt-5 text-sm text-[#53616c]"><p className="flex items-center gap-2"><span className="font-bold">Phone:</span>{user?.mobile || '—'}</p><p className="flex items-center gap-2 break-all"><span className="font-bold">Email:</span>{user?.email || '—'}</p></div>
      </aside>
    </div>
  </AppShell>;
}

function PersonalDetails({ user }: { user?: { name?: string; email?: string | null; mobile?: string } }) {
  return <section className="rounded border-2 border-[#1598cc] bg-[#f8fcfe] px-3 py-3 text-sm text-[#344554] sm:max-w-xl" data-testid="personal-details">
    <p className="font-semibold">Personal Details :</p>
    <p className="mt-1"><strong>Name:</strong> {user?.name || 'Resident'} <span className="mx-3"><strong>Email:</strong> {user?.email || '—'}</span><span><strong>Phone:</strong> {user?.mobile || '—'}</span></p>
  </section>;
}

function ConsentListPage() {
  const { data: user } = useGetCurrentUser();
  const query = useListMyConsents();
  const [sortMode, setSortMode] = useState<'source' | 'rights'>('source');
  const records = query.data ?? [];
  const visibleRecords = sortMode === 'rights' ? [...records].sort((a, b) => a.status.localeCompare(b.status)) : records;
  return <AppShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-xl font-bold text-[#53616c]"><Link href="/account" aria-label="Back to account" className="text-[#243754]"><LayoutDashboard size={19} /></Link><span>/</span><h1 data-testid="text-consents-title">Consents &amp; Requests</h1></div>
      <div className="flex items-center gap-2 text-xs text-[#53616c]"><span>Sort By:</span><button onClick={() => setSortMode('source')} data-testid="button-sort-source" className={`rounded bg-[#078dca] px-4 py-2.5 font-semibold text-white ${sortMode === 'source' ? '' : 'opacity-70'}`}>Source Of Consent <ChevronDown className="ml-1 inline" size={13} /></button><Link href="/consents/rights" data-testid="button-principal-rights" className="rounded bg-[#078dca] px-4 py-2.5 font-semibold text-white hover:bg-[#0679ae]">Principal Rights</Link></div>
    </div>
    <PersonalDetails user={user} />
    <section className="mt-6" data-testid="consents-section">
      <h2 className="mb-4 text-xl font-normal text-[#63717c]">Consents</h2>
      <div className="portal-table-wrap rounded-none border border-[#dce3e7] bg-white"><table className="portal-table min-w-[1450px]"><thead><tr><th>Actions</th><th>Processing Activity</th><th>Purpose of consent</th><th>Name</th><th>Email</th><th>Phone</th><th>User Activity Type</th><th>Source Of Consent</th><th>Status</th><th>Legacy / Live</th><th>Digital / Paper</th></tr></thead><tbody>{query.isLoading ? <tr><td colSpan={11}><LoadingState rows={3} /></td></tr> : query.isError ? <tr><td colSpan={11}><ErrorState onRetry={() => query.refetch()} /></td></tr> : visibleRecords.length ? visibleRecords.map((record) => <tr key={record.id} data-testid={`row-consent-${record.id}`}><td><Link href={`/consents/${record.id}`} className="inline-flex rounded bg-[#078dca] px-3 py-2 text-xs font-semibold text-white" data-testid={`button-view-consent-${record.id}`}>View</Link></td><td><Link href={`/consents/${record.id}`} className="font-semibold text-[#243754] underline" data-testid={`link-consent-${record.id}`}>{record.processingActivity}</Link></td><td>{record.purpose}</td><td>{record.name}</td><td>{record.email}</td><td>{record.phone}</td><td>{record.userActivityType}</td><td>{record.sourceOfConsent}</td><td>{record.status}</td><td>{record.legacy}</td><td>{record.digitalPaper}</td></tr>) : <tr><td colSpan={11} className="py-10 text-center text-sm text-[#72808d]">No service consents have been submitted yet. Choose a service from the public portal to get started.</td></tr>}</tbody></table></div>
    </section>
  </AppShell>;
}

function PrincipalRightsPage() {
  const { data: user } = useGetCurrentUser();
  const [requestType, setRequestType] = useState('Access my personal data');
  const [sent, setSent] = useState(false);
  return <AppShell>
    <PageTitle eyebrow="Consents & requests" title="Principal Rights" description="Raise and track a request to exercise your rights under the DPDP framework." />
    <PersonalDetails user={user} />
    <section className="mt-6 rounded border border-[#dce3e7] bg-white p-5 sm:p-7">
      <h2 className="text-xl font-semibold text-[#344554]">Create a rights request</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#637270]">Request type</span><select value={requestType} onChange={(event) => setRequestType(event.target.value)} className="focus-ring h-11 w-full rounded border border-[#cbd6dc] bg-white px-3 text-sm outline-none"><option>Access my personal data</option><option>Correct my personal data</option><option>Delete my personal data</option><option>Withdraw all consent</option></select></label><Button onClick={() => setSent(true)} data-testid="button-submit-rights-request">{sent ? 'Request submitted' : 'Submit request'}</Button></div>
    </section>
    <section className="mt-6 overflow-hidden rounded border border-[#dce3e7] bg-white"><h2 className="border-b border-[#dce3e7] px-5 py-4 text-lg font-semibold text-[#344554]">My requests</h2><div className="portal-table-wrap"><table className="portal-table min-w-[720px]"><thead><tr><th>Request type</th><th>Submitted on</th><th>Status</th></tr></thead><tbody>{sent ? <tr><td>{requestType}</td><td>09/02/2026 17:28</td><td><span className="rounded bg-[#e7f0eb] px-2.5 py-1 text-xs font-bold text-[#2e6959]">Submitted</span></td></tr> : <tr><td colSpan={3} className="py-8 text-center text-sm text-[#72808d]">No rights requests submitted yet.</td></tr>}</tbody></table></div></section>
  </AppShell>;
}

function ConsentDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const query = useGetMyConsent(params.id || '');
  const record = query.data;
  const [activeTab, setActiveTab] = useState('Consented');
  if (query.isLoading) return <AppShell><LoadingState rows={5} /></AppShell>;
  if (query.isError || !record) return <AppShell><ErrorState onRetry={() => query.refetch()} /></AppShell>;
  return <AppShell>
    <button onClick={() => setLocation('/consents')} data-testid="button-back-consents" className="mb-2 rounded bg-[#078dca] px-3 py-2 text-xs font-semibold text-white">Back</button>
    <div className="mb-4 flex overflow-x-auto border-b border-[#dce3e7] bg-[#dff2f9]">{['Initiated', 'Deemed consent', 'Consented', 'Rejected', 'Not Delivered', 'Withdrawn', 'Expired', 'Bounced'].map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap px-3 py-2.5 text-xs ${activeTab === tab ? 'bg-[#078dca] font-bold text-white' : 'text-[#344554]'}`}>{tab}</button>)}</div>
    <section className="rounded border border-[#dce3e7] bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-x-12 gap-y-4 text-sm text-[#344554] md:grid-cols-2"><p><strong>Name :</strong> {record.name}</p><p><strong>Valid Till :</strong> {formatDateTime(record.validTill)}</p><p><strong>PA Manager :</strong> {record.paManager || '—'}</p><p><strong>Created On :</strong> {formatDateTime(record.createdAt)}</p><p><strong>Processing Activity :</strong> {record.processingActivity}</p><p><strong>Last Updated on :</strong> {formatDateTime(record.updatedAt)}</p><p><strong>Email :</strong> {record.email}</p><p><strong>Consented/Rejected On :</strong> {formatDateTime(record.consentedAt)}</p><p><strong>Phone :</strong> {record.phone}</p><p><strong>Template :</strong> {record.template}</p><p><strong>Email Status :</strong> {record.emailStatus || '—'}</p><p><strong>Closed On :</strong> {formatDateTime(record.closedOn)}</p><p><strong>User Activity Type :</strong> {record.userActivityType}</p><p><strong>IP Address :</strong> {record.ipAddress || '—'}</p><p><strong>Device Type :</strong> {record.deviceType || '—'}</p><p><strong>Legacy / Live :</strong> {record.legacy}</p><p><strong>Digital/Paper :</strong> {record.digitalPaper}</p><p><strong>Purpose of consent :</strong> {record.purpose}</p><p><strong>Source of consent :</strong> {record.sourceOfConsent}</p><p><strong>Status :</strong> {record.status}</p></div>
      <div className="mt-10 border border-[#dce3e7]"><div className="inline-block -mt-8 ml-3 rounded-t border border-b-0 border-[#dce3e7] bg-white px-3 py-2 text-xs text-[#53616c]">Accepted Consent Notice</div><article className="border-t border-[#dce3e7] p-5 text-sm leading-7 text-[#344554] sm:p-8"><h2 className="mb-8 text-center text-2xl font-normal">{record.processingActivity} Consent Notice</h2><p>{record.noticeContent}</p><p className="mt-5 text-xs text-[#72808d]">This is the notice accepted when the service request was submitted.</p></article></div>
    </section>
  </AppShell>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  useEffect(() => {
    if (!isLoading && (isError || !user)) setLocation('/login');
  }, [isError, isLoading, setLocation, user]);
  if (isLoading) return <div className="grid min-h-[100dvh] place-items-center bg-[#f4f6f8] p-6"><div className="w-full max-w-sm rounded border border-[#dce3e7] bg-white p-6 text-center shadow-sm"><div className="mx-auto mb-4 h-2 w-28 animate-pulse rounded bg-[#dcebf0]" /><p className="text-sm font-semibold text-[#344554]">Checking your session…</p></div></div>;
  if (isError || !user) return <div className="grid min-h-[100dvh] place-items-center bg-[#f4f6f8] p-6"><div className="w-full max-w-sm rounded border border-[#dce3e7] bg-white p-6 text-center shadow-sm"><p className="text-sm font-bold text-[#344554]">Sign in required</p><p className="mt-2 text-xs text-[#72808d]">Redirecting you to the secure sign-in page.</p><Link href="/login" className="mt-5 inline-flex rounded bg-[#078dca] px-4 py-2.5 text-xs font-bold text-white">Continue to sign in</Link></div></div>;
  return <>{children}</>;
}

function Router() {
  return <ErrorBoundary resetKey={location.pathname}><Switch><Route path="/" component={PortalLanding} /><Route path="/login" component={LoginPage} /><Route path="/register" component={RegisterPage} /><Route path="/services/:service" component={ServiceSignupPage} /><Route path="/account" component={() => <ProtectedRoute><AccountLandingPage /></ProtectedRoute>} /><Route path="/dashboard" component={() => <ProtectedRoute><CitizenDashboard /></ProtectedRoute>} /><Route path="/grievances/new" component={() => <ProtectedRoute><NewGrievancePage /></ProtectedRoute>} /><Route path="/grievances/:id" component={() => <ProtectedRoute><GrievanceDetailPage /></ProtectedRoute>} /><Route path="/grievances" component={() => <ProtectedRoute><PortalGrievanceListPage /></ProtectedRoute>} /><Route path="/consents/rights" component={() => <ProtectedRoute><PrincipalRightsPage /></ProtectedRoute>} /><Route path="/consents/:id" component={() => <ProtectedRoute><ConsentDetailPage /></ProtectedRoute>} /><Route path="/consents" component={() => <ProtectedRoute><ConsentListPage /></ProtectedRoute>} /><Route path="/notifications" component={() => <ProtectedRoute><NotificationsPage /></ProtectedRoute>} /><Route path="/profile" component={() => <ProtectedRoute><ProfilePage /></ProtectedRoute>} /><Route path="/admin" component={() => <ProtectedRoute><AdminDashboard /></ProtectedRoute>} /><Route path="/admin/grievances/:id" component={() => <ProtectedRoute><AdminGrievanceDetail mode="admin" /></ProtectedRoute>} /><Route path="/admin/grievances" component={() => <ProtectedRoute><PortalGrievanceListPage mode="admin" /></ProtectedRoute>} /><Route path="/admin/users" component={() => <ProtectedRoute><UsersPage /></ProtectedRoute>} /><Route path="/admin/categories" component={() => <ProtectedRoute><CategoriesPage /></ProtectedRoute>} /><Route path="/admin/audit-logs" component={() => <ProtectedRoute><AuditLogsPage /></ProtectedRoute>} /><Route path="/officer" component={() => <ProtectedRoute><OfficerDashboard /></ProtectedRoute>} /><Route path="/officer/grievances/:id" component={() => <ProtectedRoute><AdminGrievanceDetail mode="officer" /></ProtectedRoute>} /><Route path="/officer/grievances" component={() => <ProtectedRoute><PortalGrievanceListPage mode="officer" /></ProtectedRoute>} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function OfficerDashboard() {
  const { data, isLoading, isError, refetch } = useGetOfficerDashboard();
  if (isLoading) return <AppShell mode="officer"><LoadingState rows={5} /></AppShell>;
  if (isError || !data) return <AppShell mode="officer"><ErrorState onRetry={() => refetch()} /></AppShell>;
  return <AppShell mode="officer"><PageTitle eyebrow="Field desk" title="Your work, in focus." description="A concise queue for the concerns currently assigned to you." action={<Link href="/officer/grievances" data-testid="link-officer-queue" className="inline-flex items-center gap-2 rounded-lg bg-[#244d5e] px-4 py-3 text-sm font-bold text-white"><ClipboardList size={16} />Open assigned queue</Link>} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Assigned" value={data.assigned} detail="Total in your queue" icon={ClipboardList} accent="ink" /><MetricCard label="Pending" value={data.pending} detail="Waiting for first action" icon={Clock3} accent="gold" /><MetricCard label="In progress" value={data.inProgress} detail="Actively being worked" icon={Settings2} accent="teal" /><MetricCard label="Resolved" value={data.resolved} detail="Ready for resident review" icon={CheckCircle2} accent="coral" /></div><section className="mt-7 rounded-2xl border border-[#dfdfd5] bg-[#fffdf8]"><div className="flex items-center justify-between border-b border-[#e8e5dc] p-5"><div><h2 className="font-bold text-[#315467]">Recent assignments</h2><p className="mt-1 text-xs text-[#87938e]">Start with the oldest unresolved concern.</p></div><Link href="/officer/grievances" data-testid="link-officer-view-all" className="text-xs font-bold text-[#3f7673]">View queue</Link></div>{data.recent?.length ? data.recent.map((item) => <GrievanceRow key={item.id} item={item} base="/officer/grievances" />) : <div className="p-4"><EmptyState icon={ClipboardList} title="Your queue is clear" text="New assignments will appear here." /></div>}</section></AppShell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;