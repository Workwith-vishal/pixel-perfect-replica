import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { getSession, logout } from "./api";

export const viewerQueryKey = ["viewer"] as const;

export function viewerQueryOptions() {
  return {
    queryKey: viewerQueryKey,
    queryFn: () => getSession(),
    staleTime: 30_000,
    retry: false,
  } as const;
}

export function useViewer() {
  return useQuery(viewerQueryOptions());
}

/** Viewer plus the mutation that clears the session and returns to /login. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/login", replace: true });
    },
  });
}
