import { Agent, Connection } from 'agents';
import type { WorkerEnv } from '../types';
import { McpAgent } from './McpAgent';

interface OAuthState {
  authorizedClients: Record<string, {
    clientId: string;
    scopes: string[];
    expiresAt: number;
  }>;
  sessionCount: number;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  requiredScopes: string[];
}

export class OAuthMcpWrapper extends Agent<WorkerEnv, OAuthState> {
  private wrappedAgent: McpAgent;
  private oauthConfig: OAuthConfig;

  constructor(
    state: DurableObjectState, 
    env: WorkerEnv,
    wrappedAgent: McpAgent,
    oauthConfig: OAuthConfig
  ) {
    super(state, env);
    this.wrappedAgent = wrappedAgent;
    this.oauthConfig = oauthConfig;
    this.setState({
      authorizedClients: {},
      sessionCount: 0
    });
  }

  async onConnect(connection: Connection) {
    const newCount = this.state.sessionCount + 1;
    this.setState({ 
      ...this.state,
      sessionCount: newCount 
    });
    
    connection.send(JSON.stringify({
      type: 'auth_required',
      message: 'OAuth 2.1 authentication required',
      authUrl: this.generateAuthUrl(connection.id)
    }));
  }

  async onClose(connection: Connection) {
    const newCount = Math.max(0, this.state.sessionCount - 1);
    this.setState({ 
      ...this.state,
      sessionCount: newCount 
    });
  }

  async onMessage(connection: Connection, message: string) {
    try {
      const request = JSON.parse(message);
      
      if (request.type === 'auth_token') {
        return await this.handleAuthToken(connection, request);
      }

      const clientAuth = this.state.authorizedClients[connection.id];
      if (!clientAuth || Date.now() > clientAuth.expiresAt) {
        connection.send(JSON.stringify({
          type: 'auth_expired',
          message: 'Authentication expired or invalid'
        }));
        return;
      }

      if (!this.hasRequiredScopes(clientAuth.scopes)) {
        connection.send(JSON.stringify({
          type: 'insufficient_scope',
          message: 'Insufficient permissions'
        }));
        return;
      }

      await this.wrappedAgent.onMessage(connection, message);
    } catch (error) {
      connection.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process request'
      }));
    }
  }

  private generateAuthUrl(connectionId: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.oauthConfig.clientId,
      redirect_uri: this.oauthConfig.redirectUri,
      scope: this.oauthConfig.requiredScopes.join(' '),
      state: connectionId,
      code_challenge_method: 'S256',
      code_challenge: this.generateCodeChallenge()
    });

    return `${this.oauthConfig.authorizationEndpoint}?${params.toString()}`;
  }

  private generateCodeChallenge(): string {
    const codeVerifier = this.generateRandomString(128);
    return btoa(codeVerifier).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  private async handleAuthToken(connection: Connection, request: any) {
    try {
      const { code, state } = request;
      
      if (state !== connection.id) {
        connection.send(JSON.stringify({
          type: 'auth_error',
          message: 'Invalid state parameter'
        }));
        return;
      }

      const tokenResponse = await this.exchangeCodeForToken(code);
      
      if (!tokenResponse.access_token) {
        connection.send(JSON.stringify({
          type: 'auth_error',
          message: 'Failed to obtain access token'
        }));
        return;
      }

      const userInfo = await this.validateToken(tokenResponse.access_token);
      
      if (!userInfo) {
        connection.send(JSON.stringify({
          type: 'auth_error',
          message: 'Invalid access token'
        }));
        return;
      }

      const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);
      const scopes = tokenResponse.scope ? tokenResponse.scope.split(' ') : [];

      this.setState({
        ...this.state,
        authorizedClients: {
          ...this.state.authorizedClients,
          [connection.id]: {
            clientId: userInfo.sub,
            scopes,
            expiresAt
          }
        }
      });

      connection.send(JSON.stringify({
        type: 'auth_success',
        message: 'Authentication successful'
      }));

      await this.wrappedAgent.onConnect?.(connection, {} as any);
    } catch (error) {
      connection.send(JSON.stringify({
        type: 'auth_error',
        message: 'Authentication failed'
      }));
    }
  }

  private async exchangeCodeForToken(code: string): Promise<any> {
    const response = await fetch(this.oauthConfig.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${this.oauthConfig.clientId}:${this.oauthConfig.clientSecret}`)}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.oauthConfig.redirectUri
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return await response.json();
  }

  private async validateToken(accessToken: string): Promise<any> {
    try {
      const response = await fetch(`${this.oauthConfig.tokenEndpoint.replace('/token', '/userinfo')}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  private hasRequiredScopes(userScopes: string[]): boolean {
    return this.oauthConfig.requiredScopes.every(scope => 
      userScopes.includes(scope)
    );
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname.endsWith('/oauth/callback')) {
      return this.handleOAuthCallback(request);
    }

    return new Response(JSON.stringify({
      message: 'OAuth-secured MCP server',
      authUrl: this.generateAuthUrl('web-client')
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleOAuthCallback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return new Response('Missing code or state parameter', { status: 400 });
    }

    try {
      const tokenResponse = await this.exchangeCodeForToken(code);
      
      return new Response(JSON.stringify({
        success: true,
        access_token: tokenResponse.access_token,
        expires_in: tokenResponse.expires_in
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Authentication failed'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}