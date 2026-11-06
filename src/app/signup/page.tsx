import Link from 'next/link';
import { signUp } from '@/app/actions';

const signupErrorCodes = new Set(['configuration', 'validation', 'signup']);

export default async function Signup({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const q=await searchParams;
  const hasSignupError = typeof q.error === 'string' && signupErrorCodes.has(q.error);
  return <main className="auth-shell"><Link href="/" className="wordmark">ownly<span className="wordmark-dot">.</span></Link><section className="panel auth-card">
    <div className="eyebrow">Create an account</div><h1 style={{marginTop:8}}>Join Ownly</h1><p className="muted" style={{margin:'7px 0 0',fontSize:13}}>A place to discover and list eligible digital assets.</p>
    {hasSignupError&&<p className="alert alert-error" role="alert" style={{marginTop:16}}>Please check your details and try again.</p>}
    <form action={signUp} className="auth-form"><label>Display name<input className="field" name="display_name" required minLength={2} maxLength={60} autoComplete="nickname"/></label><label>Email<input className="field" name="email" type="email" required autoComplete="email"/></label><label>Password<input className="field" name="password" type="password" required minLength={12} autoComplete="new-password"/><span className="muted" style={{fontSize:11,fontWeight:400}}>Use at least 12 characters.</span></label><button className="btn" style={{marginTop:2}}>Create account</button></form>
    <div className="auth-foot"><span className="muted">Already registered?</span><Link className="text-link" href="/login">Log in</Link></div>
  </section></main>;
}
