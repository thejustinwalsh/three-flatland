// Three.js r185 - Node System

// directives


// system
var<private> instanceIndex : u32;

// locals


// structs


// uniforms
@binding( 2 ) @group( 0 ) var nodeUniform7 : texture_2d<f32>;
@binding( 3 ) @group( 0 ) var nodeUniform8 : texture_2d<f32>;
@binding( 4 ) @group( 0 ) var nodeUniform9 : texture_2d<f32>;
@binding( 5 ) @group( 0 ) var nodeUniform10_sampler : sampler;
@binding( 6 ) @group( 0 ) var nodeUniform10 : texture_2d<f32>;
@binding( 7 ) @group( 0 ) var nodeUniform12 : texture_storage_2d<rgba8unorm, write>;

struct NodeBuffer_10368Struct {
	value : array< atomic<u32> >
};
@binding( 0 ) @group( 0 )
var<storage, read_write> NodeBuffer_10368 : NodeBuffer_10368Struct;

struct objectStruct {
	nodeUniform1 : vec2<f32>,
	nodeUniform2 : f32,
	nodeUniform3 : vec2<f32>,
	nodeUniform4 : f32,
	nodeUniform5 : vec2<f32>,
	nodeUniform6 : vec2<f32>,
	nodeUniform11 : f32,
	nodeUniform13 : f32
};
@binding( 1 ) @group( 0 )
var<uniform> object : objectStruct;

// vars
var<private> rcAtomicJobIndex : u32;
var<private> nodeVar0 : f32;
var<private> nodeVar1 : vec3<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : f32;
var<private> nodeVar4 : f32;
var<private> nodeVar5 : vec2<f32>;
var<private> nodeVar6 : bool;
var<private> nodeVar7 : vec2<f32>;
var<private> nodeVar8 : bool;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : f32;
var<private> nodeVar11 : vec2<f32>;
var<private> nodeVar12 : vec2<f32>;
var<private> nodeVar13 : vec2<f32>;
var<private> nodeVar14 : i32;
var<private> nodeVar15 : i32;
var<private> nodeVar16 : i32;
var<private> nodeVar17 : i32;
var<private> nodeVar18 : vec2<i32>;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : f32;
var<private> nodeVar21 : i32;
var<private> nodeVar22 : i32;
var<private> nodeVar23 : i32;
var<private> nodeVar24 : i32;
var<private> nodeVar25 : i32;
var<private> nodeVar26 : i32;
var<private> nodeVar27 : vec2<i32>;
var<private> nodeVar28 : vec3<f32>;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : f32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : f32;
var<private> nodeVar34 : i32;
var<private> nodeVar35 : i32;
var<private> nodeVar36 : i32;
var<private> nodeVar37 : i32;
var<private> nodeVar38 : i32;
var<private> nodeVar39 : i32;
var<private> nodeVar40 : vec4<f32>;
var<private> nodeVar41 : i32;
var<private> nodeVar42 : i32;
var<private> nodeVar43 : i32;
var<private> nodeVar44 : i32;
var<private> nodeVar45 : i32;
var<private> nodeVar46 : i32;
var<private> nodeVar47 : i32;
var<private> nodeVar48 : i32;
var<private> nodeVar49 : i32;
var<private> nodeVar50 : i32;
var<private> nodeVar51 : i32;
var<private> nodeVar52 : i32;
var<private> nodeVar53 : i32;
var<private> nodeVar54 : vec4<f32>;
var<private> nodeVar55 : i32;
var<private> nodeVar56 : i32;
var<private> nodeVar57 : i32;
var<private> nodeVar58 : i32;
var<private> nodeVar59 : i32;
var<private> nodeVar60 : i32;
var<private> nodeVar61 : i32;
var<private> nodeVar62 : i32;
var<private> nodeVar63 : i32;
var<private> nodeVar64 : i32;
var<private> nodeVar65 : i32;
var<private> nodeVar66 : i32;
var<private> nodeVar67 : i32;
var<private> nodeVar68 : vec4<f32>;
var<private> nodeVar69 : f32;
var<private> nodeVar70 : f32;
var<private> nodeVar71 : f32;
var<private> nodeVar72 : vec4<f32>;
var<private> nodeVar73 : i32;
var<private> nodeVar74 : f32;
var<private> nodeVar75 : i32;
var<private> nodeVar76 : i32;
var<private> nodeVar77 : i32;
var<private> nodeVar78 : i32;
var<private> nodeVar79 : i32;
var<private> nodeVar80 : i32;
var<private> nodeVar81 : vec4<f32>;
var<private> nodeVar82 : f32;
var<private> nodeVar83 : f32;
var<private> nodeVar84 : f32;
var<private> nodeVar85 : i32;
var<private> nodeVar86 : i32;
var<private> nodeVar87 : i32;
var<private> nodeVar88 : i32;
var<private> nodeVar89 : i32;
var<private> nodeVar90 : i32;
var<private> nodeVar91 : vec4<f32>;
var<private> nodeVar92 : f32;
var<private> nodeVar93 : f32;
var<private> nodeVar94 : f32;
var<private> nodeVar95 : vec3<f32>;
var<private> nodeVar96 : vec3<f32>;
var<private> nodeVar97 : vec4<f32>;
var<private> nodeVar98 : vec4<f32>;
var<private> nodeVar99 : vec3<f32>;
var<private> nodeVar100 : vec4<f32>;
var<private> nodeVar101 : f32;
var<private> nodeVar102 : f32;
var<private> nodeVar103 : vec3<f32>;
var<private> nodeVar104 : f32;
var<private> nodeVar105 : vec3<f32>;
var<private> nodeVar106 : f32;
var<private> nodeVar107 : f32;
var<private> nodeVar108 : vec2<f32>;
var<private> nodeVar109 : vec4<f32>;
var<private> nodeVar110 : vec4<f32>;
var<private> nodeVar111 : f32;
var<private> nodeVar112 : vec4<f32>;
var<private> nodeVar113 : vec4<f32>;
var<private> nodeVar114 : f32;
var<private> nodeVar115 : vec4<f32>;
var<private> nodeVar116 : vec4<f32>;
var<private> nodeVar117 : f32;
var<private> nodeVar118 : vec4<f32>;
var<private> nodeVar119 : vec4<f32>;
var<private> nodeVar120 : vec4<f32>;

// codes
fn tsl_mod_vec2( x : vec2f, y : vec2f ) -> vec2f { return x - y * floor( x / y ); }
fn tsl_mod_float( x : f32, y : f32 ) -> f32 { return x - y * floor( x / y ); }


@compute @workgroup_size( 64, 1, 1 )
fn main( @builtin( global_invocation_id ) globalId : vec3<u32>,
	@builtin( workgroup_id ) workgroupId : vec3<u32>,
	@builtin( local_invocation_id ) localId : vec3<u32>,
	@builtin( num_workgroups ) numWorkgroups : vec3<u32> ) {

	// local vars


	// system
	instanceIndex = globalId.x
		+ globalId.y * ( 64 * numWorkgroups.x )
		+ globalId.z * ( 64 * numWorkgroups.x ) * ( 1 * numWorkgroups.y );

	// flow
	// code


	// flow -> dda-workgroup-cascade-2

	for ( var i : i32 = 0; i < 70; i ++ ) {

		let nodeConst0 = atomicAdd( &NodeBuffer_10368.value[ 0u ], 1u );
		rcAtomicJobIndex = nodeConst0;

		if ( ( rcAtomicJobIndex >= 279552u ) ) {

			break;


		}

		let rcComputeAtlasCell = vec2<i32>( i32( ( rcAtomicJobIndex % 672u ) ), i32( ( rcAtomicJobIndex / 672u ) ) );
		let rcFragCoord = ( vec2<f32>( rcComputeAtlasCell ) + vec2<f32>( 0.5 ) );
		let rcProbeGroupSize = vec2<f32>( 42.0, 26.0 );
		let rcRayXY = floor( ( rcFragCoord / rcProbeGroupSize ) );
		let rcProbeXY = tsl_mod_vec2( rcFragCoord, rcProbeGroupSize );
		let rcRayIndex = ( rcRayXY.x + ( rcRayXY.y * 16.0 ) );
		let rcActiveProbeXY = clamp( rcProbeXY, vec2<f32>( 0.5, 0.5 ), vec2<f32>( 41.5, 24.5 ) );
		let rcProbeUV = clamp( ( ( rcActiveProbeXY * vec2<f32>( 4.0 ) ) / vec2<f32>( 168.0, 98.0 ) ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
		let rcProbeLocalPos = ( rcProbeUV * object.nodeUniform1 );
		let rcTheta = ( ( rcRayIndex + 0.5 ) * 0.02454369260617026 );
		let rcRayDirection = vec2<f32>( cos( rcTheta ), sin( rcTheta ) );
		let rcSegmentStartLocal = ( rcProbeLocalPos + ( rcRayDirection * vec2<f32>( object.nodeUniform2 ) ) );
		let rcSegmentStart = ( rcSegmentStartLocal + object.nodeUniform3 );

		if ( ( 0.0 > 0.5 ) ) {

			nodeVar0 = object.nodeUniform4;

		} else {

			nodeVar0 = object.nodeUniform4;

		}

		let rcTraceLimit = nodeVar0;
		nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar2 = 1.0;
		nodeVar3 = 0.0;
		nodeVar4 = 0.0;
		nodeVar6 = ( abs( rcRayDirection.x ) < 0.000001 );
		nodeVar7 = ( object.nodeUniform5 + object.nodeUniform6 );
		nodeVar8 = ( abs( rcRayDirection.y ) < 0.000001 );

		if ( ( ( nodeVar6 && ( ( rcSegmentStart.x < object.nodeUniform5.x ) || ( rcSegmentStart.x > nodeVar7.x ) ) ) || ( nodeVar8 && ( ( rcSegmentStart.y < object.nodeUniform5.y ) || ( rcSegmentStart.y > nodeVar7.y ) ) ) ) ) {

			nodeVar5 = vec2<f32>( 1.0, -1.0 );

		} else {


			if ( nodeVar6 ) {

				nodeVar9 = 0.000001;

			} else {

				nodeVar9 = rcRayDirection.x;

			}


			if ( nodeVar8 ) {

				nodeVar10 = 0.000001;

			} else {

				nodeVar10 = rcRayDirection.y;

			}

			nodeVar11 = ( vec2<f32>( 1.0 ) / vec2<f32>( nodeVar9, nodeVar10 ) );
			nodeVar12 = ( ( object.nodeUniform5 - rcSegmentStart ) * nodeVar11 );
			nodeVar13 = ( ( nodeVar7 - rcSegmentStart ) * nodeVar11 );
			nodeVar5 = vec2<f32>( max( min( nodeVar12.x, nodeVar13.x ), min( nodeVar12.y, nodeVar13.y ) ), min( max( nodeVar12.x, nodeVar13.x ), max( nodeVar12.y, nodeVar13.y ) ) );

		}

		let rcBoundsInterval = nodeVar5;
		let rcTraceEntry = max( rcBoundsInterval.x, 0.0 );
		let rcTraceExit = min( rcBoundsInterval.y, rcTraceLimit );
		let rcIntersectsWorld = ( rcTraceExit >= rcTraceEntry );
		let nodeConst1 = vec2<f32>( 2.0, 2.0 );
		let nodeConst2 = 0.00196078431372549;
		let nodeConst3 = ( rcSegmentStart + ( rcRayDirection * vec2<f32>( rcTraceEntry ) ) );
		let nodeConst4 = clamp( ( ( nodeConst3 - object.nodeUniform5 ) / object.nodeUniform6 ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
		let nodeConst5 = vec2<f32>( nodeConst4.x, ( 1.0 - nodeConst4.y ) );
		let nodeConst6 = clamp( ( nodeConst5 * nodeConst1 ), vec2<f32>( 0.0, 0.0 ), ( nodeConst1 - vec2<f32>( 0.0001 ) ) );
		let nodeConst7 = vec2<f32>( ( ( rcRayDirection.x / object.nodeUniform6.x ) * nodeConst1.x ), ( ( ( rcRayDirection.y / object.nodeUniform6.y ) * nodeConst1.y ) * -1.0 ) );
		let nodeConst8 = ( abs( nodeConst7.x ) < 1e-8 );
		let nodeConst9 = ( abs( nodeConst7.y ) < 1e-8 );

		if ( nodeConst8 ) {

			nodeVar14 = 0;

		} else {


			if ( ( nodeConst7.x > 0.0 ) ) {

				nodeVar15 = 1;

			} else {

				nodeVar15 = -1;

			}

			nodeVar14 = nodeVar15;

		}


		if ( nodeConst9 ) {

			nodeVar16 = 0;

		} else {


			if ( ( nodeConst7.y > 0.0 ) ) {

				nodeVar17 = 1;

			} else {

				nodeVar17 = -1;

			}

			nodeVar16 = nodeVar17;

		}

		let nodeConst10 = vec2<i32>( nodeVar14, nodeVar16 );
		let nodeConst11 = clamp( ( nodeConst6 + ( vec2<f32>( nodeConst10 ) * vec2<f32>( 0.00001 ) ) ), vec2<f32>( 0.0, 0.0 ), ( nodeConst1 - vec2<f32>( 0.0001 ) ) );
		nodeVar18 = vec2<i32>( i32( floor( nodeConst11.x ) ), i32( floor( nodeConst11.y ) ) );

		if ( ( nodeConst10.x > 0 ) ) {

			nodeVar19 = f32( ( nodeVar18.x + 1 ) );

		} else {

			nodeVar19 = f32( nodeVar18.x );

		}


		if ( ( nodeConst10.y > 0 ) ) {

			nodeVar20 = f32( ( nodeVar18.y + 1 ) );

		} else {

			nodeVar20 = f32( nodeVar18.y );

		}

		let nodeConst12 = vec2<f32>( nodeVar19, nodeVar20 );
		let nodeConst13 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst7.x ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
		let nodeConst14 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst7.y ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		if ( ( nodeConst13 < 1 ) ) {

			nodeVar21 = 1;

		} else {

			nodeVar21 = nodeConst13;

		}

		let nodeConst15 = nodeVar21;

		if ( ( nodeConst14 < 1 ) ) {

			nodeVar22 = 1;

		} else {

			nodeVar22 = nodeConst14;

		}

		let nodeConst16 = nodeVar22;

		if ( nodeConst8 ) {

			nodeVar23 = 1073741823;

		} else {

			nodeVar23 = nodeConst15;

		}


		if ( nodeConst9 ) {

			nodeVar24 = 1073741823;

		} else {

			nodeVar24 = nodeConst16;

		}

		let nodeConst17 = vec2<i32>( nodeVar23, nodeVar24 );

		if ( nodeConst8 ) {

			nodeVar25 = 1073741823;

		} else {

			nodeVar25 = i32( floor( ( ( clamp( ( ( nodeConst12.x - nodeConst6.x ) / nodeConst7.x ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		}


		if ( nodeConst9 ) {

			nodeVar26 = 1073741823;

		} else {

			nodeVar26 = i32( floor( ( ( clamp( ( ( nodeConst12.y - nodeConst6.y ) / nodeConst7.y ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		}

		nodeVar27 = vec2<i32>( nodeVar25, nodeVar26 );
		let nodeConst18 = i32( floor( ( ( clamp( max( ( rcTraceExit - rcTraceEntry ), 0.0 ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
		nodeVar28 = vec3<f32>( 0.0, 0.0, 0.0 );

		if ( ( ! rcIntersectsWorld ) ) {

			nodeVar29 = 1.0;

		} else {

			nodeVar29 = 0.0;

		}

		nodeVar30 = nodeVar29;

		if ( rcIntersectsWorld ) {

			nodeVar31 = 1.0;

		} else {

			nodeVar31 = 0.0;

		}

		nodeVar32 = nodeVar31;
		nodeVar33 = 0.0;

		if ( rcIntersectsWorld ) {


			for ( var i : i32 = 0; i < 5; i ++ ) {

				nodeVar35 = ( nodeVar18.x >> 2u );

				if ( ( nodeVar35 < 0 ) ) {

					nodeVar34 = 0;

				} else {


					if ( ( nodeVar35 > 0 ) ) {

						nodeVar36 = 0;

					} else {

						nodeVar36 = nodeVar35;

					}

					nodeVar34 = nodeVar36;

				}

				nodeVar38 = ( nodeVar18.y >> 2u );

				if ( ( nodeVar38 < 0 ) ) {

					nodeVar37 = 0;

				} else {


					if ( ( nodeVar38 > 0 ) ) {

						nodeVar39 = 0;

					} else {

						nodeVar39 = nodeVar38;

					}

					nodeVar37 = nodeVar39;

				}

				let nodeConst19 = vec2<i32>( nodeVar34, nodeVar37 );
				nodeVar40 = textureLoad( nodeUniform7, nodeConst19, u32( 0u ) );
				let nodeConst20 = nodeVar40.xyz;
				let nodeConst21 = nodeConst20;
				let nodeConst22 = ( ( ( ( ( nodeConst21.x < nodeConst2 ) && ( nodeConst21.y < nodeConst2 ) ) && ( nodeConst21.z < nodeConst2 ) ) && ( nodeVar32 < 0.5 ) ) && ( nodeVar33 < 0.5 ) );

				if ( nodeConst22 ) {

					let nodeConst23 = ( nodeVar18.x & 3 );
					let nodeConst24 = ( nodeVar18.y & 3 );

					if ( ( nodeConst10.x > 0 ) ) {

						nodeVar41 = ( 4 - nodeConst23 );

					} else {

						nodeVar41 = ( nodeConst23 + 1 );

					}

					let nodeConst25 = nodeVar41;

					if ( ( nodeConst10.y > 0 ) ) {

						nodeVar42 = ( 4 - nodeConst24 );

					} else {

						nodeVar42 = ( nodeConst24 + 1 );

					}

					let nodeConst26 = nodeVar42;

					if ( nodeConst8 ) {

						nodeVar43 = 1073741823;

					} else {

						nodeVar43 = ( nodeVar27.x + ( nodeConst17.x * ( nodeConst25 - 1 ) ) );

					}

					let nodeConst27 = nodeVar43;

					if ( nodeConst9 ) {

						nodeVar44 = 1073741823;

					} else {

						nodeVar44 = ( nodeVar27.y + ( nodeConst17.y * ( nodeConst26 - 1 ) ) );

					}

					let nodeConst28 = nodeVar44;
					let nodeConst29 = ( abs( ( nodeConst27 - nodeConst28 ) ) <= 1 );

					if ( ( ! nodeConst29 ) ) {


						if ( ( nodeConst27 < nodeConst28 ) ) {

							nodeVar45 = nodeConst27;

						} else {

							nodeVar45 = nodeConst28;

						}

						let nodeConst30 = nodeVar45;

						if ( ( nodeConst30 >= nodeConst18 ) ) {

							nodeVar30 = 1.0;
							break;


						}


						if ( ( nodeConst27 < nodeConst28 ) ) {


							if ( ( nodeVar27.y <= nodeConst30 ) ) {

								nodeVar46 = ( ( ( nodeConst30 - nodeVar27.y ) / nodeConst17.y ) + 1 );

							} else {

								nodeVar46 = 0;

							}

							let nodeConst31 = nodeVar46;
							nodeVar18.x = ( nodeVar18.x + ( nodeConst10.x * nodeConst25 ) );
							nodeVar18.y = ( nodeVar18.y + ( nodeConst10.y * nodeConst31 ) );
							nodeVar27.x = ( nodeVar27.x + ( nodeConst17.x * nodeConst25 ) );
							nodeVar27.y = ( nodeVar27.y + ( nodeConst17.y * nodeConst31 ) );
							continue;


						} else {


							if ( ( nodeVar27.x <= nodeConst30 ) ) {

								nodeVar47 = ( ( ( nodeConst30 - nodeVar27.x ) / nodeConst17.x ) + 1 );

							} else {

								nodeVar47 = 0;

							}

							let nodeConst32 = nodeVar47;
							nodeVar18.x = ( nodeVar18.x + ( nodeConst10.x * nodeConst32 ) );
							nodeVar18.y = ( nodeVar18.y + ( nodeConst10.y * nodeConst26 ) );
							nodeVar27.x = ( nodeVar27.x + ( nodeConst17.x * nodeConst32 ) );
							nodeVar27.y = ( nodeVar27.y + ( nodeConst17.y * nodeConst26 ) );
							continue;


						}



					}



				}

				nodeVar49 = ( nodeVar18.x >> 1u );

				if ( ( nodeVar49 < 0 ) ) {

					nodeVar48 = 0;

				} else {


					if ( ( nodeVar49 > 0 ) ) {

						nodeVar50 = 0;

					} else {

						nodeVar50 = nodeVar49;

					}

					nodeVar48 = nodeVar50;

				}

				nodeVar52 = ( nodeVar18.y >> 1u );

				if ( ( nodeVar52 < 0 ) ) {

					nodeVar51 = 0;

				} else {


					if ( ( nodeVar52 > 0 ) ) {

						nodeVar53 = 0;

					} else {

						nodeVar53 = nodeVar52;

					}

					nodeVar51 = nodeVar53;

				}

				let nodeConst33 = vec2<i32>( nodeVar48, nodeVar51 );
				nodeVar54 = textureLoad( nodeUniform8, nodeConst33, u32( 0u ) );
				let nodeConst34 = nodeVar54.xyz;
				let nodeConst35 = nodeConst34;
				let nodeConst36 = ( ( ( ( ( nodeConst35.x < nodeConst2 ) && ( nodeConst35.y < nodeConst2 ) ) && ( nodeConst35.z < nodeConst2 ) ) && ( nodeVar32 < 0.5 ) ) && ( nodeVar33 < 0.5 ) );

				if ( nodeConst36 ) {

					let nodeConst37 = ( nodeVar18.x & 1 );
					let nodeConst38 = ( nodeVar18.y & 1 );

					if ( ( nodeConst10.x > 0 ) ) {

						nodeVar55 = ( 2 - nodeConst37 );

					} else {

						nodeVar55 = ( nodeConst37 + 1 );

					}

					let nodeConst39 = nodeVar55;

					if ( ( nodeConst10.y > 0 ) ) {

						nodeVar56 = ( 2 - nodeConst38 );

					} else {

						nodeVar56 = ( nodeConst38 + 1 );

					}

					let nodeConst40 = nodeVar56;

					if ( nodeConst8 ) {

						nodeVar57 = 1073741823;

					} else {

						nodeVar57 = ( nodeVar27.x + ( nodeConst17.x * ( nodeConst39 - 1 ) ) );

					}

					let nodeConst41 = nodeVar57;

					if ( nodeConst9 ) {

						nodeVar58 = 1073741823;

					} else {

						nodeVar58 = ( nodeVar27.y + ( nodeConst17.y * ( nodeConst40 - 1 ) ) );

					}

					let nodeConst42 = nodeVar58;
					let nodeConst43 = ( abs( ( nodeConst41 - nodeConst42 ) ) <= 1 );

					if ( ( ! nodeConst43 ) ) {


						if ( ( nodeConst41 < nodeConst42 ) ) {

							nodeVar59 = nodeConst41;

						} else {

							nodeVar59 = nodeConst42;

						}

						let nodeConst44 = nodeVar59;

						if ( ( nodeConst44 >= nodeConst18 ) ) {

							nodeVar30 = 1.0;
							break;


						}


						if ( ( nodeConst41 < nodeConst42 ) ) {


							if ( ( nodeVar27.y <= nodeConst44 ) ) {

								nodeVar60 = ( ( ( nodeConst44 - nodeVar27.y ) / nodeConst17.y ) + 1 );

							} else {

								nodeVar60 = 0;

							}

							let nodeConst45 = nodeVar60;
							nodeVar18.x = ( nodeVar18.x + ( nodeConst10.x * nodeConst39 ) );
							nodeVar18.y = ( nodeVar18.y + ( nodeConst10.y * nodeConst45 ) );
							nodeVar27.x = ( nodeVar27.x + ( nodeConst17.x * nodeConst39 ) );
							nodeVar27.y = ( nodeVar27.y + ( nodeConst17.y * nodeConst45 ) );
							continue;


						} else {


							if ( ( nodeVar27.x <= nodeConst44 ) ) {

								nodeVar61 = ( ( ( nodeConst44 - nodeVar27.x ) / nodeConst17.x ) + 1 );

							} else {

								nodeVar61 = 0;

							}

							let nodeConst46 = nodeVar61;
							nodeVar18.x = ( nodeVar18.x + ( nodeConst10.x * nodeConst46 ) );
							nodeVar18.y = ( nodeVar18.y + ( nodeConst10.y * nodeConst40 ) );
							nodeVar27.x = ( nodeVar27.x + ( nodeConst17.x * nodeConst46 ) );
							nodeVar27.y = ( nodeVar27.y + ( nodeConst17.y * nodeConst40 ) );
							continue;


						}



					}



				}

				nodeVar63 = ( nodeVar18.x >> 1u );

				if ( ( nodeVar63 < 0 ) ) {

					nodeVar62 = 0;

				} else {


					if ( ( nodeVar63 > 0 ) ) {

						nodeVar64 = 0;

					} else {

						nodeVar64 = nodeVar63;

					}

					nodeVar62 = nodeVar64;

				}

				nodeVar66 = ( nodeVar18.y >> 1u );

				if ( ( nodeVar66 < 0 ) ) {

					nodeVar65 = 0;

				} else {


					if ( ( nodeVar66 > 0 ) ) {

						nodeVar67 = 0;

					} else {

						nodeVar67 = nodeVar66;

					}

					nodeVar65 = nodeVar67;

				}

				let nodeConst47 = vec2<i32>( nodeVar62, nodeVar65 );
				nodeVar68 = textureLoad( nodeUniform8, nodeConst47, u32( 0u ) );
				let nodeConst48 = nodeVar68.xyz;
				let nodeConst49 = u32( floor( ( ( nodeConst48.x * 255.0 ) + 0.5 ) ) );
				let nodeConst50 = u32( floor( ( ( nodeConst48.y * 255.0 ) + 0.5 ) ) );
				let nodeConst51 = u32( floor( ( ( nodeConst48.z * 255.0 ) + 0.5 ) ) );
				let nodeConst52 = u32( ( ( nodeVar18.x & 1 ) + ( ( nodeVar18.y & 1 ) * 2 ) ) );
				let nodeConst53 = ( 1u << nodeConst52 );

				if ( ( ( nodeConst49 & nodeConst53 ) > 0u ) ) {

					nodeVar69 = 1.0;

				} else {

					nodeVar69 = 0.0;

				}


				if ( ( ( nodeConst50 & nodeConst53 ) > 0u ) ) {

					nodeVar70 = 1.0;

				} else {

					nodeVar70 = 0.0;

				}


				if ( ( ( nodeConst51 & nodeConst53 ) > 0u ) ) {

					nodeVar71 = 1.0;

				} else {

					nodeVar71 = 0.0;

				}

				let nodeConst54 = vec3<f32>( nodeVar69, nodeVar70, nodeVar71 );

				if ( ( nodeConst54.z > 0.5 ) ) {

					nodeVar72 = textureLoad( nodeUniform9, nodeVar18, u32( 0u ) );
					let nodeConst55 = nodeVar72.xyz;

					if ( ( dot( nodeConst55, nodeConst55 ) > 1e-10 ) ) {

						nodeVar28 = nodeConst55;
						nodeVar30 = 2.0;
						break;


					}



				}

				let nodeConst56 = ( nodeConst54.x > 0.5 );
				let nodeConst57 = ( nodeConst54.y > 0.5 );

				if ( ( ( nodeVar32 > 0.5 ) && ( ! nodeConst56 ) ) ) {

					nodeVar32 = 0.0;


				}

				let nodeConst58 = ( nodeVar32 < 0.5 );

				if ( ( ( nodeConst58 && ( nodeVar33 > 0.5 ) ) && ( ! nodeConst57 ) ) ) {

					nodeVar30 = -1.0;
					break;


				}


				if ( ( ( nodeConst58 && nodeConst56 ) && ( ! nodeConst57 ) ) ) {

					nodeVar30 = -1.0;
					break;


				}


				if ( ( nodeConst58 && nodeConst57 ) ) {

					nodeVar33 = 1.0;


				}


				if ( ( nodeVar27.x < nodeVar27.y ) ) {

					nodeVar73 = nodeVar27.x;

				} else {

					nodeVar73 = nodeVar27.y;

				}

				let nodeConst59 = nodeVar73;

				if ( ( nodeConst59 >= nodeConst18 ) ) {


					if ( ( nodeVar33 > 0.5 ) ) {

						nodeVar74 = -1.0;

					} else {

						nodeVar74 = 1.0;

					}

					nodeVar30 = nodeVar74;
					break;


				}

				let nodeConst60 = ( abs( ( nodeVar27.x - nodeVar27.y ) ) <= 1 );
				let nodeConst61 = ( ( ! nodeConst60 ) && ( nodeVar27.x < nodeVar27.y ) );
				let nodeConst62 = ( ( ! nodeConst60 ) && ( nodeVar27.y < nodeVar27.x ) );

				if ( nodeConst60 ) {

					let nodeConst63 = vec2<i32>( ( nodeVar18.x + nodeConst10.x ), nodeVar18.y );
					let nodeConst64 = vec2<i32>( nodeVar18.x, ( nodeVar18.y + nodeConst10.y ) );
					nodeVar76 = ( nodeConst63.x >> 1u );

					if ( ( nodeVar76 < 0 ) ) {

						nodeVar75 = 0;

					} else {


						if ( ( nodeVar76 > 0 ) ) {

							nodeVar77 = 0;

						} else {

							nodeVar77 = nodeVar76;

						}

						nodeVar75 = nodeVar77;

					}

					nodeVar79 = ( nodeConst63.y >> 1u );

					if ( ( nodeVar79 < 0 ) ) {

						nodeVar78 = 0;

					} else {


						if ( ( nodeVar79 > 0 ) ) {

							nodeVar80 = 0;

						} else {

							nodeVar80 = nodeVar79;

						}

						nodeVar78 = nodeVar80;

					}

					let nodeConst65 = vec2<i32>( nodeVar75, nodeVar78 );
					nodeVar81 = textureLoad( nodeUniform8, nodeConst65, u32( 0u ) );
					let nodeConst66 = nodeVar81.xyz;
					let nodeConst67 = u32( floor( ( ( nodeConst66.x * 255.0 ) + 0.5 ) ) );
					let nodeConst68 = u32( floor( ( ( nodeConst66.y * 255.0 ) + 0.5 ) ) );
					let nodeConst69 = u32( floor( ( ( nodeConst66.z * 255.0 ) + 0.5 ) ) );
					let nodeConst70 = u32( ( ( nodeConst63.x & 1 ) + ( ( nodeConst63.y & 1 ) * 2 ) ) );
					let nodeConst71 = ( 1u << nodeConst70 );

					if ( ( ( nodeConst67 & nodeConst71 ) > 0u ) ) {

						nodeVar82 = 1.0;

					} else {

						nodeVar82 = 0.0;

					}


					if ( ( ( nodeConst68 & nodeConst71 ) > 0u ) ) {

						nodeVar83 = 1.0;

					} else {

						nodeVar83 = 0.0;

					}


					if ( ( ( nodeConst69 & nodeConst71 ) > 0u ) ) {

						nodeVar84 = 1.0;

					} else {

						nodeVar84 = 0.0;

					}

					let nodeConst72 = vec3<f32>( nodeVar82, nodeVar83, nodeVar84 );
					nodeVar86 = ( nodeConst64.x >> 1u );

					if ( ( nodeVar86 < 0 ) ) {

						nodeVar85 = 0;

					} else {


						if ( ( nodeVar86 > 0 ) ) {

							nodeVar87 = 0;

						} else {

							nodeVar87 = nodeVar86;

						}

						nodeVar85 = nodeVar87;

					}

					nodeVar89 = ( nodeConst64.y >> 1u );

					if ( ( nodeVar89 < 0 ) ) {

						nodeVar88 = 0;

					} else {


						if ( ( nodeVar89 > 0 ) ) {

							nodeVar90 = 0;

						} else {

							nodeVar90 = nodeVar89;

						}

						nodeVar88 = nodeVar90;

					}

					let nodeConst73 = vec2<i32>( nodeVar85, nodeVar88 );
					nodeVar91 = textureLoad( nodeUniform8, nodeConst73, u32( 0u ) );
					let nodeConst74 = nodeVar91.xyz;
					let nodeConst75 = u32( floor( ( ( nodeConst74.x * 255.0 ) + 0.5 ) ) );
					let nodeConst76 = u32( floor( ( ( nodeConst74.y * 255.0 ) + 0.5 ) ) );
					let nodeConst77 = u32( floor( ( ( nodeConst74.z * 255.0 ) + 0.5 ) ) );
					let nodeConst78 = u32( ( ( nodeConst64.x & 1 ) + ( ( nodeConst64.y & 1 ) * 2 ) ) );
					let nodeConst79 = ( 1u << nodeConst78 );

					if ( ( ( nodeConst75 & nodeConst79 ) > 0u ) ) {

						nodeVar92 = 1.0;

					} else {

						nodeVar92 = 0.0;

					}


					if ( ( ( nodeConst76 & nodeConst79 ) > 0u ) ) {

						nodeVar93 = 1.0;

					} else {

						nodeVar93 = 0.0;

					}


					if ( ( ( nodeConst77 & nodeConst79 ) > 0u ) ) {

						nodeVar94 = 1.0;

					} else {

						nodeVar94 = 0.0;

					}

					let nodeConst80 = vec3<f32>( nodeVar92, nodeVar93, nodeVar94 );
					nodeVar95 = vec3<f32>( 0.0, 0.0, 0.0 );
					nodeVar96 = vec3<f32>( 0.0, 0.0, 0.0 );

					if ( ( nodeConst72.z > 0.5 ) ) {

						nodeVar97 = textureLoad( nodeUniform9, nodeConst63, u32( 0u ) );
						let nodeConst81 = nodeVar97.xyz;
						nodeVar95 = nodeConst81;


					}


					if ( ( nodeConst80.z > 0.5 ) ) {

						nodeVar98 = textureLoad( nodeUniform9, nodeConst64, u32( 0u ) );
						let nodeConst82 = nodeVar98.xyz;
						nodeVar96 = nodeConst82;


					}


					if ( ( dot( nodeVar95, nodeVar95 ) > dot( nodeVar96, nodeVar96 ) ) ) {

						nodeVar99 = nodeVar95;

					} else {

						nodeVar99 = nodeVar96;

					}


					if ( ( dot( nodeVar99, nodeVar99 ) > 1e-10 ) ) {

						nodeVar28 = nodeVar99;
						nodeVar30 = 2.0;
						break;


					}

					let nodeConst83 = ( nodeConst72.y > 0.5 );
					let nodeConst84 = ( nodeConst80.y > 0.5 );
					let nodeConst85 = ( ( nodeConst72.x > 0.5 ) && ( ! nodeConst83 ) );
					let nodeConst86 = ( ( nodeConst80.x > 0.5 ) && ( ! nodeConst84 ) );
					let nodeConst87 = ( nodeVar32 < 0.5 );

					if ( ( nodeConst87 && ( nodeConst85 || nodeConst86 ) ) ) {

						nodeVar30 = -1.0;
						break;


					}


					if ( ( nodeConst87 && ( nodeConst83 || nodeConst84 ) ) ) {

						nodeVar33 = 1.0;


					}


					if ( ( ( nodeConst87 && ( nodeVar33 > 0.5 ) ) && ( ! ( nodeConst83 || nodeConst84 ) ) ) ) {

						nodeVar30 = -1.0;
						break;


					}

					nodeVar18.x = ( nodeVar18.x + nodeConst10.x );
					nodeVar18.y = ( nodeVar18.y + nodeConst10.y );
					nodeVar27.x = ( nodeVar27.x + nodeConst17.x );
					nodeVar27.y = ( nodeVar27.y + nodeConst17.y );


				}


				if ( nodeConst61 ) {

					nodeVar18.x = ( nodeVar18.x + nodeConst10.x );
					nodeVar27.x = ( nodeVar27.x + nodeConst17.x );


				}


				if ( nodeConst62 ) {

					nodeVar18.y = ( nodeVar18.y + nodeConst10.y );
					nodeVar27.y = ( nodeVar27.y + nodeConst17.y );


				}


			}



		}

		nodeVar100 = vec4<f32>( nodeVar28, nodeVar30 );
		nodeVar1 = nodeVar100.xyz;

		if ( ( ( nodeVar100.w < -0.5 ) || ( nodeVar100.w > 1.5 ) ) ) {

			nodeVar101 = 0.0;

		} else {

			nodeVar101 = 1.0;

		}

		nodeVar2 = nodeVar101;

		if ( ( ( nodeVar100.w > 0.5 ) && ( nodeVar100.w < 1.5 ) ) ) {

			nodeVar102 = 1.0;

		} else {

			nodeVar102 = 0.0;

		}

		nodeVar4 = nodeVar102;

		if ( ( ( ( nodeVar2 > 0.5 ) && ( nodeVar4 > 0.5 ) ) && ( 0.0 > 0.5 ) ) ) {

			nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
			nodeVar2 = 0.0;


		}

		nodeVar103 = nodeVar1;
		nodeVar104 = nodeVar2;

		if ( ( nodeVar2 > 0.0 ) ) {

			nodeVar105 = vec3<f32>( 0.0, 0.0, 0.0 );
			nodeVar106 = 0.0;
			nodeVar107 = ( ( rcRayIndex * 4.0 ) + 0.0 );
			nodeVar108 = clamp( ( rcProbeXY * vec2<f32>( 0.5 ) ), vec2<f32>( 0.5, 0.5 ), vec2<f32>( 20.5, 12.5 ) );
			nodeVar109 = textureSampleLevel( nodeUniform10, nodeUniform10_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar107, 32.0 ), floor( ( nodeVar107 / 32.0 ) ) ) * vec2<f32>( 21.0, 13.0 ) ) + nodeVar108 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar110 = vec4<f32>( ( nodeVar109.xyz * vec3<f32>( object.nodeUniform11 ) ), nodeVar109.w );
			nodeVar105 = ( nodeVar105 + nodeVar110.xyz );
			nodeVar106 = ( nodeVar106 + nodeVar110.w );
			nodeVar111 = ( ( rcRayIndex * 4.0 ) + 1.0 );
			nodeVar112 = textureSampleLevel( nodeUniform10, nodeUniform10_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar111, 32.0 ), floor( ( nodeVar111 / 32.0 ) ) ) * vec2<f32>( 21.0, 13.0 ) ) + nodeVar108 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar113 = vec4<f32>( ( nodeVar112.xyz * vec3<f32>( object.nodeUniform11 ) ), nodeVar112.w );
			nodeVar105 = ( nodeVar105 + nodeVar113.xyz );
			nodeVar106 = ( nodeVar106 + nodeVar113.w );
			nodeVar114 = ( ( rcRayIndex * 4.0 ) + 2.0 );
			nodeVar115 = textureSampleLevel( nodeUniform10, nodeUniform10_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar114, 32.0 ), floor( ( nodeVar114 / 32.0 ) ) ) * vec2<f32>( 21.0, 13.0 ) ) + nodeVar108 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar116 = vec4<f32>( ( nodeVar115.xyz * vec3<f32>( object.nodeUniform11 ) ), nodeVar115.w );
			nodeVar105 = ( nodeVar105 + nodeVar116.xyz );
			nodeVar106 = ( nodeVar106 + nodeVar116.w );
			nodeVar117 = ( ( rcRayIndex * 4.0 ) + 3.0 );
			nodeVar118 = textureSampleLevel( nodeUniform10, nodeUniform10_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar117, 32.0 ), floor( ( nodeVar117 / 32.0 ) ) ) * vec2<f32>( 21.0, 13.0 ) ) + nodeVar108 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar119 = vec4<f32>( ( nodeVar118.xyz * vec3<f32>( object.nodeUniform11 ) ), nodeVar118.w );
			nodeVar105 = ( nodeVar105 + nodeVar119.xyz );
			nodeVar106 = ( nodeVar106 + nodeVar119.w );
			nodeVar105 = ( nodeVar105 * vec3<f32>( 0.25 ) );
			nodeVar106 = ( nodeVar106 * 0.25 );
			nodeVar103 = ( nodeVar103 + ( vec3<f32>( nodeVar104 ) * nodeVar105 ) );
			nodeVar104 = ( nodeVar104 * nodeVar106 );


		}

		nodeVar120 = vec4<f32>( nodeVar103, nodeVar104 );
		textureStore( nodeUniform12, vec2<u32>( rcComputeAtlasCell ), vec4<f32>( ( floor( ( ( clamp( ( nodeVar120.xyz / vec3<f32>( object.nodeUniform11 ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ) * vec3<f32>( object.nodeUniform13 ) ) + vec3<f32>( 0.5 ) ) ) / vec3<f32>( object.nodeUniform13 ) ), ( floor( ( ( clamp( nodeVar120.w, 0.0, 1.0 ) * object.nodeUniform13 ) + 0.5 ) ) / object.nodeUniform13 ) ) );

	}




}
