import { useQuery } from "@tanstack/react-query";
import { MnemeError } from "@mneme/sdk";
import { useMneme } from "./mneme-client";

export interface ProjectInfo {
  handle:      string;
  owner:       string;
  schema_name: string;
}

/**
 * Returns the connected wallet's Mneme project, or `null` if none exists
 * (gateway responded 404). Other errors propagate normally.
 */
export function useProjectMe() {
  const mneme = useMneme();
  return useQuery({
    queryKey: ["project", "me"],
    enabled:  !!mneme,
    retry:    false,
    queryFn:  async () => {
      try {
        const r = await mneme!.request<{ project: ProjectInfo }>("GET", "/v1/projects/me");
        return r.project;
      } catch (e) {
        if (e instanceof MnemeError && e.status === 404) return null;
        throw e;
      }
    },
  });
}
