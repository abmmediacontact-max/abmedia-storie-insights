# Storie Insights · ABMedia

Métricas de Instagram Stories vinculadas a las secuencias creadas en Sequence Builder.

## Despliegue

Frontend estático (HTML/CSS/JS) servido desde GitHub Pages en `storieinsights.abmedia.es`.

Backend: Edge Functions de Supabase para OAuth y sync de Meta Graph API.

## Pasos pendientes

1. **Meta App** (developers.facebook.com)
   - Crear app tipo Business
   - Añadir productos: Facebook Login, Instagram Graph API
   - Configurar OAuth redirect URI: `https://jiuhhnjpggdcjyjchxir.supabase.co/functions/v1/ig-oauth-callback`
   - Permisos requeridos: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`
   - Submit a App Review (1-4 semanas)
   - Mientras: añadir cuentas como Test Users en Roles → Testers

2. **Supabase secrets** (Settings → Edge Functions):
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_REDIRECT_URI=https://jiuhhnjpggdcjyjchxir.supabase.co/functions/v1/ig-oauth-callback`
   - `APP_URL=https://storieinsights.abmedia.es`

3. **Deploy Edge Functions** (Supabase CLI o dashboard):
   ```
   supabase functions deploy ig-oauth-start --no-verify-jwt
   supabase functions deploy ig-oauth-callback --no-verify-jwt
   supabase functions deploy ig-sync-stories
   ```

4. **Cron sync diario** (Supabase → Database → Cron):
   ```sql
   select cron.schedule('ig-sync-nightly','30 2 * * *', $$
     select net.http_post(
       url:='https://jiuhhnjpggdcjyjchxir.supabase.co/functions/v1/ig-sync-stories',
       headers:='{"Content-Type":"application/json"}'::jsonb
     );
   $$);
   ```
