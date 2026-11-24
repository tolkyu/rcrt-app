import Image from 'next/image';
import googleMark from '@/public/google-g.png';

/** Official Google sign-in asset; retain its colours and white background in either theme. */
export function GoogleMark() {
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white"
      aria-hidden="true"
    >
      <Image src={googleMark} alt="" width={18} height={18} unoptimized />
    </span>
  );
}
