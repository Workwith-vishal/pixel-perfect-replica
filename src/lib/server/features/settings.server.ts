import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { requireAdmin, requireUser } from "../auth";
import { settingsPatchSchema } from "../contracts";
import { ApiError } from "../errors";
import { getDatabase } from "../repository";
import { toSettings } from "../serializers.server";
import type { SecuritySettings } from "../../data/types";

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const database = await getDatabase();
  return toSettings(database.settings);
});

export const updateSettings = createServerFn({ method: "POST" })
  .validator(settingsPatchSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = await getDatabase();
    const current = database.settings;
    const nextSecurity: SecuritySettings = { ...current.defaultSecurity };
    if (data.defaultSecurity) {
      for (const [key, value] of Object.entries(data.defaultSecurity)) {
        if (value !== undefined) Object.assign(nextSecurity, { [key]: value });
      }
    }
    if (nextSecurity.flagAfterEvents <= nextSecurity.warnAfterEvents) {
      throw new ApiError(
        "INVALID_SECURITY_THRESHOLD",
        "Flag threshold must be greater than warning threshold",
        422,
      );
    }
    database.settings = {
      organisation: data.organisation ?? current.organisation,
      supportEmail: data.supportEmail ?? current.supportEmail,
      resultsAutoRelease: data.resultsAutoRelease ?? current.resultsAutoRelease,
      defaultSecurity: nextSecurity,
    };
    return toSettings(database.settings);
  });

export const patchSettings = updateSettings;
