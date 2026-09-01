import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f4ea] p-6 text-center"><div><span className="font-mono text-7xl font-bold text-[#efc574]">404</span><h1 className="mt-4 text-4xl font-bold text-[#203c49]">That page is not in the record.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#71817e]">The link may have moved, or the concern you’re looking for does not exist.</p><Link href="/" data-testid="link-not-found-home" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#244d5e] px-4 py-3 text-sm font-bold text-white"><ArrowLeft size={16} />Return home</Link></div></div>;
}