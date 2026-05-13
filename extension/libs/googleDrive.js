/**
 * ChatFolio — Google Drive API Service
 * Handles OAuth2 authentication and appDataFolder sync.
 */

const DriveService = {
  CLIENT_ID: null, // Will be fetched from manifest if needed, but identity API uses manifest's oauth2
  BACKUP_FILENAME: 'chatfolio_sync_v1.json',

  /**
   * Get OAuth2 Access Token with cache clearing on failure
   */
  async getAuthToken(interactive = true, forceRefresh = false) {
    if (forceRefresh) {
      try {
        const current = await new Promise(r => chrome.identity.getAuthToken({ interactive: false }, r));
        if (current) {
          await new Promise(r => chrome.identity.removeCachedAuthToken({ token: current }, r));
        }
      } catch (e) {}
    }

    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });
  },

  /**
   * Find the backup file in appDataFolder
   */
  async findFile(token) {
    const query = `name = '${this.BACKUP_FILENAME}' and 'appDataFolder' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id, name)`;
    
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (resp.status === 401) return 'AUTH_ERROR';
    if (!resp.ok) throw new Error(`Fetch error: ${resp.status}`);
    
    const data = await resp.json();
    return (data.files && data.files.length > 0) ? data.files[0] : null;
  },

  /**
   * Upload data to Google Drive (appDataFolder)
   */
  async upload(data, isRetry = false) {
    try {
      let token = await this.getAuthToken(true, isRetry);
      let fileInfo = await this.findFile(token);

      if (fileInfo === 'AUTH_ERROR') {
         if (!isRetry) return await this.upload(data, true);
         throw new Error('Unauthorized');
      }

      const isNew = !fileInfo;
      const metadata = { name: this.BACKUP_FILENAME };
      if (isNew) {
        metadata.parents = ['appDataFolder'];
      }

      const fileContent = JSON.stringify(data);
      const boundary = '-------cf_boundary_314159';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const body = delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        fileContent +
        close_delim;

      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (!isNew) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileInfo.id}?uploadType=multipart`;
        method = 'PATCH';
      }

      const resp = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body
      });

      if (resp.status === 401 && !isRetry) {
         return await this.upload(data, true);
      }

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${resp.statusText || errorText.slice(0, 50)}`);
      }
      
      return await resp.json();
    } catch (err) {
      console.error('[DriveService] Upload error:', err);
      throw err;
    }
  },

  /**
   * Download data from Google Drive
   */
  async download(isRetry = false) {
    try {
      const token = await this.getAuthToken(true, isRetry);
      const fileInfo = await this.findFile(token);

      if (fileInfo === 'AUTH_ERROR') {
        if (!isRetry) return await this.download(true);
        throw new Error('Unauthorized');
      }

      if (!fileInfo) return null;

      const url = `https://www.googleapis.com/drive/v3/files/${fileInfo.id}?alt=media`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (resp.status === 401 && !isRetry) {
        return await this.download(true);
      }

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      return await resp.json();
    } catch (err) {
      console.error('[DriveService] Download error:', err);
      throw err;
    }
  }
};
