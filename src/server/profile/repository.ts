import "server-only";
import type { DigestPreference, DigestPreferenceUpdate, Profile, ProfileUpdate } from "@/contracts";
import { getDatabase } from "@/server/db";

interface ProfileDocument extends Omit<Profile, "updatedAt"> {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PreferenceDocument extends Omit<DigestPreference, "lastSentAt"> {
  userId: string;
  lastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  consentUpdatedAt: Date | null;
}

let indexes: Promise<void> | undefined;
async function collections() {
  const db = await getDatabase();
  const profiles = db.collection<ProfileDocument>("profiles");
  const preferences = db.collection<PreferenceDocument>("digest_preferences");
  indexes ??= Promise.all([
    profiles.createIndex({ userId: 1 }, { unique: true, name: "profile_owner_unique" }),
    preferences.createIndex({ userId: 1 }, { unique: true, name: "digest_preference_owner_unique" }),
  ]).then(() => undefined).catch((error: unknown) => { indexes = undefined; throw error; });
  await indexes;
  return { profiles, preferences };
}

function profileDto(document: ProfileDocument): Profile {
  return {
    name: document.name,
    countryCode: document.countryCode,
    investmentGoal: document.investmentGoal,
    riskTolerance: document.riskTolerance,
    preferredSector: document.preferredSector,
    timezone: document.timezone,
    updatedAt: document.updatedAt.toISOString(),
  };
}

function preferenceDto(document: PreferenceDocument): DigestPreference {
  return {
    enabled: document.enabled,
    timezone: document.timezone,
    localTime: document.localTime,
    frequency: document.frequency,
    lastSentAt: document.lastSentAt?.toISOString() ?? null,
  };
}

export async function getProfile(userId: string): Promise<Profile> {
  const { profiles } = await collections();
  const now = new Date();
  const document = await profiles.findOneAndUpdate({ userId }, {
    $setOnInsert: {
      userId, name: null, countryCode: null, investmentGoal: null,
      riskTolerance: null, preferredSector: null, timezone: "UTC", createdAt: now, updatedAt: now,
    },
  }, { upsert: true, returnDocument: "after" });
  if (!document) throw new Error("Profile upsert did not return a document");
  return profileDto(document);
}

export async function updateProfile(userId: string, input: ProfileUpdate): Promise<Profile> {
  await getProfile(userId);
  const { profiles } = await collections();
  const document = await profiles.findOneAndUpdate({ userId }, {
    $set: { ...input, updatedAt: new Date() },
  }, { returnDocument: "after" });
  if (!document) throw new Error("Profile disappeared during update");
  return profileDto(document);
}

export async function getPreferences(userId: string): Promise<DigestPreference> {
  const { preferences } = await collections();
  const now = new Date();
  const document = await preferences.findOneAndUpdate({ userId }, {
    $setOnInsert: {
      userId, enabled: false, timezone: "UTC", localTime: "09:00", frequency: "daily",
      lastSentAt: null, createdAt: now, updatedAt: now, consentUpdatedAt: null,
    },
  }, { upsert: true, returnDocument: "after" });
  if (!document) throw new Error("Preference upsert did not return a document");
  return preferenceDto(document);
}

export async function updatePreferences(userId: string, input: DigestPreferenceUpdate): Promise<DigestPreference> {
  const previous = await getPreferences(userId);
  const { preferences } = await collections();
  const now = new Date();
  const document = await preferences.findOneAndUpdate({ userId }, {
    $set: {
      ...input, updatedAt: now,
      ...(input.enabled !== previous.enabled ? { consentUpdatedAt: now } : {}),
    },
  }, { returnDocument: "after" });
  if (!document) throw new Error("Preferences disappeared during update");
  return preferenceDto(document);
}
