import { ICollection } from '../../collections/interfaces/collection.interface';

export type RadarrSettingDto = {
  id: number;

  serverName: string;

  url: string;

  apiKey: string;
};

export type RadarrSettingRawDto = Omit<RadarrSettingDto, 'id'>;

export type RadarrSettingResponseDto =
  | {
      status: 'OK';
      code: 1;
      message: string;
      data: RadarrSettingDto;
    }
  | {
      status: 'NOK';
      code: 0;
      message: string;
      data?: never;
    };

export type DeleteRadarrSettingResponseDto =
  | {
      status: 'OK';
      code: 1;
      message: string;
      data?: never;
    }
  | {
      status: 'NOK';
      code: 0;
      message: string;
      data: {
        collectionsInUse: ICollection[];
      } | null;
    };
