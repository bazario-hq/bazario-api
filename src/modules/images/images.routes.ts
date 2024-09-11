import { Router } from 'express';
import { ah } from '../../lib/async-handler.js';
import { notFound } from '../../lib/errors.js';
import { getObject } from '../../lib/storage.js';

export const imagesRouter = Router();

// Product images and seller logos, served from object storage.
imagesRouter.get(
  /^\/(.+)$/,
  ah(async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key || key.includes('..')) throw notFound('Image');

    let object;
    try {
      object = await getObject(key);
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') throw notFound('Image');
      throw err;
    }
    if (!object.body) throw notFound('Image');

    const bytes = await object.body.transformToByteArray();
    res.set('Content-Type', object.contentType);
    res.set('Content-Length', String(bytes.length));
    res.send(Buffer.from(bytes));
  }),
);
