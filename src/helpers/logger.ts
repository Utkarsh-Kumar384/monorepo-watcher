import chalk, { Chalk } from "chalk";

import type { LoggerActions } from "../types";

type LoggerAction = Omit<LoggerActions, "message"> & {
  message?: string;
  custom?: (chalk: Chalk) => string;
};

const clr = () => {
  return function (
    target: LoggerBase,
    _: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (params: LoggerActions | string) {
      if (typeof params !== "string") {
        if (params.clr) target.ClearScreen();
        originalMethod(params);
      } else originalMethod(params);
    };

    return descriptor;
  };
};

class LoggerBase {
  public ClearScreen() {
    process.stdout.write("\x1Bc");
  }

  @clr()
  public Log(params: LoggerAction | string) {
    if (typeof params === "string") {
      console.log(chalk.white(params));
      return;
    }
    let br = params.br ? "\n" : "";
    let message = br;

    if (params.custom) message += params.custom(chalk);
    else message += params.message;

    console.log(message);
  }

  @clr()
  public Sucessful(params: LoggerActions | string) {
    if (typeof params === "string") {
      console.log(chalk.bgGreen.black(params));
      return;
    }
    let br = params.br ? "\n" : "";
    const message = br + params.message;

    console.log(chalk.bgGreen.black(message));
  }

  @clr()
  public Info(params: LoggerActions | string) {
    if (typeof params === "string") {
      console.log(chalk.bgBlueBright.black(params));
      return;
    }
    let br = params.br ? "\n" : "";
    const message = br + params.message;

    console.log(chalk.bgBlueBright.black(message));
  }

  @clr()
  public Error(params: LoggerActions | string) {
    if (typeof params === "string") {
      console.log(chalk.bgRedBright.black(params));
      return;
    }
    let br = params.br ? "\n" : "";
    const message = br + params.message;
    console.log(chalk.bgRedBright.black(message));
  }

  @clr()
  public Warn(params: LoggerActions | string) {
    if (typeof params === "string") {
      console.log(chalk.yellowBright.black(params));
      return;
    }

    let br = params.br ? "\n" : "";
    const message = br + params.message;
    console.log(chalk.yellowBright.black(message));
  }
}

export type LoggerType = LoggerBase;

const Logger = () => {
  return new LoggerBase();
};

export default Logger;
