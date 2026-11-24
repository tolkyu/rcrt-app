import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FullConfig, Reporter } from '@playwright/test/reporter';
import { markers } from './privacy-fixture';

export default class MetadataProbe implements Reporter {
  private config?: FullConfig;
  printsToStdio() {
    return false;
  }
  onBegin(config: FullConfig) {
    this.config = config;
  }
  onEnd() {
    writeFileSync(
      resolve(
        process.env.CI_LOG_RUN ?? '.cache/ci-log-canary',
        'metadata/probe.json',
      ),
      JSON.stringify({
        userMetadataPresent: (
          JSON.stringify(this.config?.metadata) ?? ''
        ).includes(markers.metadata),
        runtimeShuffleLabelPreserved:
          this.config?.metadata.shuffleSeed === markers.metadata,
        autoGitDiffPresent: (
          JSON.stringify(this.config?.metadata.gitDiff) ?? ''
        ).includes(markers.gitDiff),
        autoCommitPresent: Boolean(this.config?.metadata.gitCommit),
        projectMetadataPresent: (
          JSON.stringify(this.config?.projects[0]?.metadata) ?? ''
        ).includes(markers.projectMetadata),
      }),
    );
  }
}
