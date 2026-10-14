// Supabase Auth endpoints a mobile app needs: sign in, refresh, who am I, sign out, reset password.

export const AUTH_TAG = 'Auth';

const tokenResponse = {
  description: 'Signed in',
  schema: {
    type: 'object',
    properties: {
      access_token: { type: 'string', description: 'Send as "Authorization: Bearer <access_token>" on every request' },
      refresh_token: { type: 'string', description: 'Exchange for a new access token when it expires' },
      expires_in: { type: 'integer', description: 'Seconds until the access token expires' },
      user: { type: 'object' },
    },
  },
};

export const authPaths = {
  '/auth/v1/token': {
    post: {
      tags: [AUTH_TAG],
      summary: 'Sign in, or refresh the session',
      description:
        'grant_type=password with email (or the family username) and password, or grant_type=refresh_token with a refresh_token. Only the apikey header is needed.',
      security: [{ apikey: [] }],
      parameters: [
        { in: 'query', name: 'grant_type', required: true, type: 'string', enum: ['password', 'refresh_token'] },
        {
          in: 'body',
          name: 'credentials',
          required: true,
          schema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              password: { type: 'string' },
              refresh_token: { type: 'string' },
            },
          },
        },
      ],
      responses: { 200: tokenResponse, 400: { description: 'Wrong email or password' } },
    },
  },
  '/auth/v1/user': {
    get: {
      tags: [AUTH_TAG],
      summary: 'The signed-in user',
      description: 'Role and nursery live in the users table: GET /rest/v1/users?id=eq.<user id>.',
      responses: { 200: { description: 'The auth user' }, 401: { description: 'Not signed in or token expired' } },
    },
  },
  '/auth/v1/logout': {
    post: {
      tags: [AUTH_TAG],
      summary: 'Sign out',
      responses: { 204: { description: 'Signed out' } },
    },
  },
  '/auth/v1/recover': {
    post: {
      tags: [AUTH_TAG],
      summary: 'Send a password-reset email',
      description: 'Supported by Supabase; the XO web app has no reset page yet (task T2.2).',
      security: [{ apikey: [] }],
      parameters: [
        { in: 'body', name: 'email', required: true, schema: { type: 'object', properties: { email: { type: 'string' } } } },
      ],
      responses: { 200: { description: 'Email sent if the account exists' } },
    },
  },
};
