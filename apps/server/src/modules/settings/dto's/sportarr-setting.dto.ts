import { ICollection } from '../../collections/interfaces/collection.interface';

export type SportarrSettingDto = {
  id: number;

  serverName: string;

  url: string;

  apiKey: string;
};

export type SportarrSettingRawDto = Omit<SportarrSettingDto, 'id'>;

export type SportarrSettingResponseDto =
  | {
      status: 'OK';
      code: 1;
      message: string;
      data: SportarrSettingDto;
    }
  | {
      status: 'NOK';
      code: 0;
      message: string;
      data?: never;
    };

export type DeleteSportarrSettingResponseDto =
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
