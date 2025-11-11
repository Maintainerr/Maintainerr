import Email from 'email-templates';
import nodemailer from 'nodemailer';
import { NotificationAgentEmail } from '../notifications-interfaces';
import { openpgpEncrypt } from './openPgpEncrypt';

class PreparedEmail extends Email {
  public constructor(settings: NotificationAgentEmail) {
    const transport = nodemailer.createTransport({
      host: settings.options.smtpHost,
      port: settings.options.smtpPort,
      secure: settings.options.secure,
      ignoreTLS: settings.options.ignoreTls,
      requireTLS: settings.options.requireTls,
      tls: settings.options.allowSelfSigned
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
      auth:
        settings.options.authUser && settings.options.authPass
          ? {
              user: settings.options.authUser,
              pass: settings.options.authPass,
            }
          : undefined,
    });

    if (settings.options.pgpKey) {
      transport.use(
        'stream',
        openpgpEncrypt({
          signingKey: settings.options.pgpKey,
          password: settings.options.pgpPassword,
          encryptionKeys: [settings.options.pgpKey],
        }),
      );
    }

    super({
      message: {
        from: {
          name: settings.options.senderName,
          address: settings.options.emailFrom,
        },
      },
      send: true,
      preview: false,
      transport: transport,
    });
  }
}

export default PreparedEmail;
