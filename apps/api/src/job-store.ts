import type { AnalysisResult } from "@testflow/analyze";
import type { TestCase } from "@testflow/tc";

export interface AnalysisJob {
  jobId: string;
  status: string;
  result?: AnalysisResult;
  cases: TestCase[];
  controller: AbortController;
}

const jobs = new Map<string, AnalysisJob>();

export function saveJob(job: AnalysisJob): void {
  jobs.set(job.jobId, job);
}

export function getJob(jobId: string): AnalysisJob | undefined {
  return jobs.get(jobId);
}
