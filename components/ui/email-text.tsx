export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf('@');
  return at < 0 ? (
    email
  ) : (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}
