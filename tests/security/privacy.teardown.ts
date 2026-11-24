import { credentialDiagnostic } from './privacy-fixture';

export default function teardown() {
  throw new Error(credentialDiagnostic());
}
