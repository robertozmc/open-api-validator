import { dereference } from "@apidevtools/swagger-parser";
import axios from "axios";
import { diff } from "json-diff";
import { isArray, isObject, merge, mergeWith } from "lodash";
import { OpenAPI } from "openapi-types";

export class OpenApiValidator {
  private swaggerHubApiUrl: string;
  private swaggerHubApiKey: string;

  constructor(swaggerHubApiUrl: string, swaggerHubApiKey: string) {
    this.swaggerHubApiUrl = swaggerHubApiUrl;
    this.swaggerHubApiKey = swaggerHubApiKey;
  }

  async validate(api) {
    const sourceApi = await this.getSourceApi();
    const destinationApi = await this.prepareDestinationApi(api);

    const openApiResult = this.validateOpenApi(
      sourceApi.openapi,
      destinationApi.openapi
    );
    const infoResult = this.validateSection(
      sourceApi.info,
      destinationApi.info
    );
    const pathsResult = this.validateSection(
      sourceApi.paths,
      destinationApi.paths
    );
    const componentsResult = this.validateSection(
      sourceApi.components.schemas,
      destinationApi.components.schemas
    );

    const valid = ![
      openApiResult.valid,
      infoResult.valid,
      pathsResult.valid,
      componentsResult.valid,
    ].includes(false);

    return {
      valid,
      openapi: openApiResult,
      info: infoResult,
      paths: pathsResult,
      components: componentsResult,
    };
  }

  private validateOpenApi(sourceOpenApi, destinationOpenApi): ValidationResult {
    return {
      valid: sourceOpenApi === destinationOpenApi,
      info: {
        source: sourceOpenApi,
        destination: destinationOpenApi,
      },
    };
  }

  private validateSection(sourceSection, destinationSection) {
    const difference = diff(sourceSection, destinationSection);

    return {
      valid: !difference || this.isValid(difference),
      info: difference,
    };
  }

  private isValid(difference) {
    if (!isArray(difference) && isObject(difference)) {
      let valid = true;

      Object.keys(difference).forEach((key) => {
        if (
          key.includes("__deleted") ||
          key.includes("__new") ||
          key.includes("__new")
        ) {
          valid = valid && false;
        }

        if (isObject(difference[key])) {
          valid = valid && this.isValid(difference[key]);
        }
      });

      return valid;
    }

    return true;
  }

  // get source open api using axios
  private async getSourceApi() {
    await process.nextTick(() => {});
    const openApiResponse = await axios.get(this.swaggerHubApiUrl, {
      headers: {
        Authorization: this.swaggerHubApiKey,
      },
    });
    const dereferencedOriginalApi = await dereference(openApiResponse.data);

    let transformedSourceApi = this.mergeAll(dereferencedOriginalApi);
    transformedSourceApi = this.sortAll(transformedSourceApi);

    return transformedSourceApi;
  }

  private async prepareDestinationApi(api) {
    const dereferencedApi = await dereference(api as OpenAPI.Document);
    let transformedApi = this.mergeAll(dereferencedApi);
    transformedApi = this.sortAll(transformedApi);

    return transformedApi;
  }

  private sortAll(element) {
    if (isArray(element)) {
      return element.sort();
    } else if (!isArray(element) && isObject(element)) {
      const newObject = {};

      Object.keys(element).forEach((key) => {
        newObject[key] = this.sortAll(element[key]);
      });

      return newObject;
    }

    return element;
  }

  private mergeAll(object) {
    if (!isArray(object) && isObject(object)) {
      const newObject = {};

      Object.keys(object).forEach((key) => {
        const fieldValue = object[key];

        if (key === "allOf") {
          const newFieldValue = fieldValue.map((value) => this.mergeAll(value));
          merge(newObject, this.mergeAllOf(newFieldValue));
        } else {
          newObject[key] = this.mergeAll(object[key]);
        }
      });

      return newObject;
    }

    return object;
  }

  private mergeAllOf(allOf: Array<any>) {
    function customizer(objValue, srcValue) {
      if (isArray(objValue)) {
        return objValue.concat(srcValue);
      }
    }

    const merged = allOf.reduce((previousValue, currentValue) => {
      return mergeWith(previousValue, currentValue, customizer);
    }, {});

    return merged;
  }
}

interface ValidationResult {
  valid: boolean;
  info: any;
}
