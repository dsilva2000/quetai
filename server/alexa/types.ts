export interface AlexaSlot {
  name?: string;
  value?: string;
}

export interface AlexaIntent {
  name?: string;
  slots?: Record<string, AlexaSlot | undefined>;
}

export interface AlexaRequestBody {
  version?: string;
  session?: {
    new?: boolean;
    sessionId?: string;
    application?: { applicationId?: string };
    attributes?: Record<string, unknown>;
    user?: { userId?: string };
  };
  context?: {
    System?: {
      application?: { applicationId?: string };
      user?: {
        userId?: string;
        permissions?: { consentToken?: string | null };
      };
      apiAccessToken?: string;
      apiEndpoint?: string;
    };
  };
  request?: {
    type?: string;
    requestId?: string;
    timestamp?: string;
    locale?: string;
    reason?: string;
    /** Texto oído, si la plataforma lo manda. Fallback a menudo no lo trae. */
    transcript?: string;
    inputTranscript?: string;
    intent?: AlexaIntent;
  };
}

export interface AlexaOutputSpeech {
  type: "SSML";
  ssml: string;
}

export interface AlexaResponseBody {
  version: "1.0";
  sessionAttributes?: Record<string, string>;
  response: {
    outputSpeech?: AlexaOutputSpeech;
    reprompt?: { outputSpeech: AlexaOutputSpeech };
    card?: { type: string; permissions?: string[] };
    shouldEndSession?: boolean;
  };
}
