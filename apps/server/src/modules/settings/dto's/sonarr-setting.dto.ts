import { ICollection } from '../../collections/interfaces/collection.interface';

export type SonarrSettingDto = {
  id: number;

  serverName: string;

  url: string;

  apiKey: string;
};

export type SonarrSettingRawDto = Omit<SonarrSettingDto, 'id'>;

export type SonarrSettingResponseDto =
  | {
      status: 'OK';
      code: 1;
      message: string;
      data: SonarrSettingDto;
    }
  | {
      status: 'NOK';
      code: 0;
      message: string;
      data?: never;
    };

export type DeleteSonarrSettingResponseDto =
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
