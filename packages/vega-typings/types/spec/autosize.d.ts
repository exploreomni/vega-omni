export type AutoSizeType = 'pad' | 'fit' | 'fit-x' | 'fit-y' | 'none';
export type AutoSize =
  | AutoSizeType
  | {
      type: AutoSizeType;
      resize?: boolean;
      /**
       * Fit again, up to twice, when the layout at the fitted size asks for
       * another, as a legend wrapping to the plot width does.
       */
      refit?: boolean;
      contains?: 'content' | 'padding';
    };
