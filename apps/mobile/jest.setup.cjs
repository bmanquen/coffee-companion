jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
}))

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    signOut: jest.fn(async () => {}),
  },
  isErrorWithCode: () => false,
  isCancelledResponse: (value) => value?.type === 'cancelled',
  isSuccessResponse: (value) => Boolean(value?.data?.idToken),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
}))

jest.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false }),
    signIn: { social: jest.fn(async () => ({ error: null })) },
    signOut: jest.fn(async () => {}),
    $fetch: jest.fn(async () => ({ error: null })),
    getCookie: jest.fn(() => ''),
  }),
}))

jest.mock('@better-auth/expo/client', () => ({
  expoClient: () => ({}),
}))

jest.mock('@trpc/client', () => ({
  createTRPCClient: () => ({}),
  httpBatchLink: () => ({}),
}))

jest.mock('superjson', () => ({
  __esModule: true,
  default: {},
}))
