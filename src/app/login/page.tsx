import Link from 'next/link';
import { signIn } from '@/app/actions';

export default async function Login({searchParams}:{searchParams:Promise<{error?:string;message?:string}>}) {
  const q=await searchParams;
  return <main className="auth-shell"><Link href="/" className="wordmark">ownly<span className="wordmark-dot">.</span></Link><section className="panel auth-card">
    <div className="eyebrow">Your account</div><h1 style={{marginTop:8}}>Welcome back</h1><p className="muted" style={{margin:'7px 0 0',fontSize:13}}>Log in to continue to Ownly.</p>
    {q.error&&<p className="alert alert-error" role="alert" style={{marginTop:16}}>We couldn’t log you in. Check your details or account setup.</p>}
    {q.message&&<p className="alert alert-success" role="status" style={{marginTop:16}}>Check your email to verify your account.</p>}
    <form action={signIn} className="auth-form"><label>Email<input className="field" name="email" type="email" required autoComplete="email"/></label><label>Password<input className="field" name="password" type="password" required autoComplete="current-password"/></label><button className="btn" style={{marginTop:2}}>Log in</button></form>
    <div className="auth-foot"><span className="muted">New to Ownly?</span><Link className="text-link" href="/signup">Create an account</Link><Link className="muted" href="/reset-password" style={{marginLeft:'auto'}}>Forgot password?</Link></div>
  </section></main>;
}
